import { supabase } from '../lib/supabase/client';
import { 
  AiConversation, 
  AiMessage, 
  AiContextData, 
  AiContextType 
} from '../types';

const LOCAL_STORAGE_CONVERSATIONS_KEY = 'biocode_ai_conversations_v1';
const LOCAL_STORAGE_MESSAGES_PREFIX = 'biocode_ai_messages_';

// In-memory fallback cache
let memoryConversations: AiConversation[] = [];
let memoryMessages: Record<string, AiMessage[]> = {};

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
   * Create a new conversation (Supabase with Local Fallback)
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

    const conversationObj: AiConversation = {
      id: newId,
      user_id: userId || undefined,
      project_id: projectId,
      sequence_id: sequenceId,
      title,
      context_type: contextType,
      context_summary: contextSummary,
      created_at: timestamp,
      updated_at: timestamp,
      messages: []
    };

    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          id: newId,
          user_id: userId || null,
          project_id: projectId || null,
          sequence_id: sequenceId || null,
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

    // Local / In-memory Fallback
    memoryConversations.unshift(conversationObj);
    this.saveLocalConversations(memoryConversations);
    return conversationObj;
  }

  /**
   * Fetch user's conversations
   */
  async getConversations(userId?: string | null): Promise<AiConversation[]> {
    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data && Array.isArray(data)) {
        return data;
      }
    } catch (err) {
      console.warn('[AiService] Fetching conversations from Supabase failed, reading local store:', err);
    }

    // Read local fallback
    return this.getLocalConversations();
  }

  /**
   * Fetch messages for a specific conversation
   */
  async getMessages(conversationId: string): Promise<AiMessage[]> {
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data && Array.isArray(data)) {
        return data;
      }
    } catch (err) {
      console.warn('[AiService] Fetching messages from Supabase failed, reading local store:', err);
    }

    return this.getLocalMessages(conversationId);
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

    const msgObj: AiMessage = {
      id: newId,
      conversation_id: conversationId,
      user_id: userId || undefined,
      sender,
      role,
      content,
      metadata,
      created_at: timestamp
    };

    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .insert({
          id: newId,
          conversation_id: conversationId,
          user_id: userId || null,
          sender,
          role,
          content,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (!error && data) {
        // Also touch updated_at on conversation
        await supabase
          .from('ai_conversations')
          .update({ updated_at: timestamp })
          .eq('id', conversationId);

        return data;
      }
    } catch (err) {
      console.warn('[AiService] Supabase message save fallback to local memory:', err);
    }

    // Local fallback
    const currentMsgs = this.getLocalMessages(conversationId);
    currentMsgs.push(msgObj);
    this.saveLocalMessages(conversationId, currentMsgs);

    // Touch conversation updated_at locally
    const convs = this.getLocalConversations();
    const targetConv = convs.find(c => c.id === conversationId);
    if (targetConv) {
      targetConv.updated_at = timestamp;
      this.saveLocalConversations(convs);
    }

    return msgObj;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      await supabase.from('ai_conversations').delete().eq('id', conversationId);
    } catch {}

    const convs = this.getLocalConversations().filter(c => c.id !== conversationId);
    this.saveLocalConversations(convs);
    try {
      localStorage.removeItem(LOCAL_STORAGE_MESSAGES_PREFIX + conversationId);
    } catch {}
    delete memoryMessages[conversationId];
    return true;
  }

  // Local Storage Helpers
  private getLocalConversations(): AiConversation[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CONVERSATIONS_KEY);
      if (raw) {
        memoryConversations = JSON.parse(raw);
        return memoryConversations;
      }
    } catch {}
    return memoryConversations;
  }

  private saveLocalConversations(convs: AiConversation[]) {
    memoryConversations = convs;
    try {
      localStorage.setItem(LOCAL_STORAGE_CONVERSATIONS_KEY, JSON.stringify(convs));
    } catch {}
  }

  private getLocalMessages(conversationId: string): AiMessage[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_MESSAGES_PREFIX + conversationId);
      if (raw) {
        const msgs = JSON.parse(raw);
        memoryMessages[conversationId] = msgs;
        return msgs;
      }
    } catch {}
    return memoryMessages[conversationId] || [];
  }

  private saveLocalMessages(conversationId: string, msgs: AiMessage[]) {
    memoryMessages[conversationId] = msgs;
    try {
      localStorage.setItem(LOCAL_STORAGE_MESSAGES_PREFIX + conversationId, JSON.stringify(msgs));
    } catch {}
  }
}

export const aiService = new AiService();
