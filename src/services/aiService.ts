import { supabase, isSupabaseConfigured, getActiveSupabaseUserId, getOrCreateGuestScopeId } from '../lib/supabase/client';
import { 
  AiConversation, 
  AiMessage, 
  AiContextData, 
  AiContextType 
} from '../types';

const LOCAL_STORAGE_CONVERSATIONS_BASE = 'biocode_ai_conversations_v1';
const LOCAL_STORAGE_MESSAGES_PREFIX = 'biocode_ai_messages_';

function isValidUUID(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

async function resolveAiScope(explicitUserId?: string | null): Promise<{ cloudUserId: string | null; localScopeId: string }> {
  let cloudUserId: string | null = null;
  if (isValidUUID(explicitUserId)) {
    cloudUserId = explicitUserId!.trim();
  } else if (isSupabaseConfigured) {
    const activeUid = await getActiveSupabaseUserId();
    if (isValidUUID(activeUid)) cloudUserId = activeUid;
  }
  const localScopeId = cloudUserId || getOrCreateGuestScopeId();
  return { cloudUserId, localScopeId };
}

function getScopedConversationsKey(scopeId: string): string {
  return `${LOCAL_STORAGE_CONVERSATIONS_BASE}_${scopeId}`;
}

// In-memory fallback cache keyed by scope
const memoryConversationsByScope: Record<string, AiConversation[]> = {};
const memoryMessages: Record<string, AiMessage[]> = {};

export class AiService {
  /**
   * Fetch backend AI configuration (Single Source of Truth)
   */
  async getAiConfig(): Promise<{ primaryModel: string; fallbackModels: string[]; configured: boolean }> {
    try {
      const response = await fetch('/api/ai/config', {
        headers: { Accept: 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (err) {
      console.warn('[AiService] Failed to load /api/ai/config:', err);
    }
    return {
      primaryModel: 'gemini-3.1-flash-lite',
      fallbackModels: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'],
      configured: true
    };
  }

  /**
   * Send user message to the backend AI route (/api/ai/chat)
   */
  async sendMessageToAi(
    message: string, 
    history: { role: 'user' | 'model'; content: string }[], 
    context?: AiContextData
  ): Promise<{ text: string; modelUsed?: string; requestId?: string }> {
    try {
      const endpoint = '/api/ai/chat';
      console.log('[BioAI Request]', {
        endpoint,
        messageLength: message.length,
        contextType: context?.type || 'dashboard',
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          message,
          history,
          context,
        }),
      });

      const responseText = await response.text();
      const contentType = response.headers.get('content-type') || '';
      
      // Safe diagnostic logging (no secrets, keys, or user data)
      console.log('[BioAI Diagnostic Log]', {
        endpoint,
        status: response.status,
        ok: response.ok,
        contentType,
        bodyPrefix: responseText.substring(0, 200).replace(/\s+/g, ' ')
      });

      // Guard against HTML response (e.g. proxy failure, routing issue, or SPA fallback)
      if (contentType.includes('text/html') || responseText.trim().startsWith('<')) {
        throw new Error(`BioAI endpoint returned an HTML page (HTTP ${response.status}) instead of JSON. Please check server configuration or retry.`);
      }

      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`BioAI service returned an invalid non-JSON response format (HTTP ${response.status}).`);
      }

      if (!response.ok || data.ok === false) {
        const errorMsg = data.error?.message || data.error || data.message || `HTTP ${response.status}: Failed to reach BioAI service`;
        const errObj: any = new Error(errorMsg);
        errObj.code = data.error?.code || data.code;
        errObj.modelUsed = data.modelUsed;
        errObj.status = response.status;
        throw errObj;
      }

      if (!data.text) {
        throw new Error('BioAI returned an empty response.');
      }

      return {
        text: data.text,
        modelUsed: data.modelUsed,
        requestId: data.requestId
      };
    } catch (err: any) {
      console.error('[AiService.sendMessageToAi Error]', err);
      throw err;
    }
  }

  /**
   * Create a new conversation (Supabase with isolated per-visitor Fallback)
   */
  async createConversation(
    userId?: string | null,
    title: string = 'New BioAI Session',
    contextType: AiContextType = 'dashboard',
    contextSummary?: Record<string, any>,
    projectId?: string,
    sequenceId?: string
  ): Promise<AiConversation> {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `conv_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const { cloudUserId, localScopeId } = await resolveAiScope(userId);

    const conversationObj: AiConversation = {
      id: newId,
      user_id: cloudUserId || undefined,
      project_id: projectId,
      sequence_id: sequenceId,
      title,
      context_type: contextType,
      context_summary: contextSummary,
      created_at: timestamp,
      updated_at: timestamp,
      messages: []
    };

    if (isSupabaseConfigured && cloudUserId) {
      try {
        const { data, error } = await supabase
          .from('ai_conversations')
          .insert({
            id: newId,
            user_id: cloudUserId,
            project_id: isValidUUID(projectId) ? projectId : null,
            sequence_id: isValidUUID(sequenceId) ? sequenceId : null,
            title,
            context_type: contextType,
            context_summary: contextSummary || {},
          })
          .select()
          .single();

        if (!error && data) {
          return {
            ...data,
            messages: []
          };
        }
      } catch (err) {
        console.warn('[AiService] Supabase conversation save fallback to local memory:', err);
      }
    }

    // Scoped Local / In-memory Fallback
    const existing = this.getLocalConversations(localScopeId);
    const updated = [conversationObj, ...existing.filter(c => c.id !== conversationObj.id)];
    this.saveLocalConversations(updated, localScopeId);
    return conversationObj;
  }

  /**
   * Fetch visitor's conversations (cloud scoped by auth.uid() when available, otherwise isolated per-visitor local scope)
   */
  async getConversations(userId?: string | null): Promise<AiConversation[]> {
    const { cloudUserId, localScopeId } = await resolveAiScope(userId);

    if (isSupabaseConfigured && cloudUserId) {
      try {
        const { data, error } = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('user_id', cloudUserId)
          .order('updated_at', { ascending: false });

        if (!error && data && Array.isArray(data)) {
          return data;
        }
      } catch (err) {
        console.warn('[AiService] Fetching conversations from Supabase failed, reading local store:', err);
      }
    }

    // Read scoped local fallback
    return this.getLocalConversations(localScopeId);
  }

  /**
   * Fetch messages for a specific conversation
   */
  async getMessages(conversationId: string, userId?: string | null): Promise<AiMessage[]> {
    const { cloudUserId, localScopeId } = await resolveAiScope(userId);

    if (isSupabaseConfigured && cloudUserId) {
      try {
        const { data, error } = await supabase
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .eq('user_id', cloudUserId)
          .order('created_at', { ascending: true });

        if (!error && data && Array.isArray(data)) {
          return data;
        }
      } catch (err) {
        console.warn('[AiService] Fetching messages from Supabase failed, reading local store:', err);
      }
    }

    return this.getLocalMessages(conversationId, localScopeId);
  }

  /**
   * Save a single message to a conversation
   */
  async saveMessage(
    conversationId: string,
    sender: 'user' | 'ai',
    role: 'user' | 'model' | 'assistant',
    content: string,
    userId?: string | null,
    metadata?: Record<string, any>
  ): Promise<AiMessage> {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const { cloudUserId, localScopeId } = await resolveAiScope(userId);

    const msgObj: AiMessage = {
      id: newId,
      conversation_id: conversationId,
      user_id: cloudUserId || undefined,
      sender,
      role,
      content,
      metadata,
      created_at: timestamp
    };

    if (isSupabaseConfigured && cloudUserId) {
      try {
        const { data, error } = await supabase
          .from('ai_messages')
          .insert({
            id: newId,
            conversation_id: conversationId,
            user_id: cloudUserId,
            sender,
            role,
            content,
            metadata: metadata || {},
          })
          .select()
          .single();

        if (!error && data) {
          // Also touch updated_at on conversation owned by this user
          await supabase
            .from('ai_conversations')
            .update({ updated_at: timestamp })
            .eq('id', conversationId)
            .eq('user_id', cloudUserId);

          return data;
        }
      } catch (err) {
        console.warn('[AiService] Supabase message save fallback to local memory:', err);
      }
    }

    // Scoped Local fallback
    const currentMsgs = this.getLocalMessages(conversationId, localScopeId);
    currentMsgs.push(msgObj);
    this.saveLocalMessages(conversationId, currentMsgs, localScopeId);

    // Touch conversation updated_at locally
    const convs = this.getLocalConversations(localScopeId);
    const targetConv = convs.find(c => c.id === conversationId);
    if (targetConv) {
      targetConv.updated_at = timestamp;
      this.saveLocalConversations(convs, localScopeId);
    }

    return msgObj;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string, userId?: string | null): Promise<boolean> {
    const { cloudUserId, localScopeId } = await resolveAiScope(userId);
    if (isSupabaseConfigured && cloudUserId) {
      try {
        await supabase
          .from('ai_conversations')
          .delete()
          .eq('id', conversationId)
          .eq('user_id', cloudUserId);
      } catch {}
    }

    const convs = this.getLocalConversations(localScopeId).filter(c => c.id !== conversationId);
    this.saveLocalConversations(convs, localScopeId);
    const msgKey = this.getMessagesKey(conversationId, localScopeId);
    try {
      localStorage.removeItem(msgKey);
    } catch {}
    delete memoryMessages[msgKey];
    return true;
  }

  // Scoped Local Storage Helpers
  private getMessagesKey(conversationId: string, scopeId: string): string {
    return `${LOCAL_STORAGE_MESSAGES_PREFIX}${scopeId}_${conversationId}`;
  }

  private getLocalConversations(scopeId: string): AiConversation[] {
    const key = getScopedConversationsKey(scopeId);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        memoryConversationsByScope[key] = JSON.parse(raw);
        return memoryConversationsByScope[key];
      }
    } catch {}
    return memoryConversationsByScope[key] || [];
  }

  private saveLocalConversations(convs: AiConversation[], scopeId: string) {
    const key = getScopedConversationsKey(scopeId);
    memoryConversationsByScope[key] = convs;
    try {
      localStorage.setItem(key, JSON.stringify(convs));
    } catch {}
  }

  private getLocalMessages(conversationId: string, scopeId: string): AiMessage[] {
    const key = this.getMessagesKey(conversationId, scopeId);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const msgs = JSON.parse(raw);
        memoryMessages[key] = msgs;
        return msgs;
      }
    } catch {}
    return memoryMessages[key] || [];
  }

  private saveLocalMessages(conversationId: string, msgs: AiMessage[], scopeId: string) {
    const key = this.getMessagesKey(conversationId, scopeId);
    memoryMessages[key] = msgs;
    try {
      localStorage.setItem(key, JSON.stringify(msgs));
    } catch {}
  }
}

export const aiService = new AiService();
