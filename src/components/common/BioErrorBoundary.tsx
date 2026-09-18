import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface BioErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  moduleName?: string;
  onReset?: () => void;
}

export interface BioErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class BioErrorBoundary extends Component<BioErrorBoundaryProps, BioErrorBoundaryState> {
  constructor(props: BioErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): BioErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[BioErrorBoundary] Error caught in module ${this.props.moduleName || 'Unknown'}:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-[#FFF1F2] border border-[#FECDD3] rounded-2xl space-y-4 max-w-2xl mx-auto shadow-[0_4px_24px_rgba(244,63,94,0.08)] font-mono">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white border border-[#FECDD3] text-[#E11D48] shrink-0 shadow-2xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#9F1239]">
                {this.props.fallbackTitle || `Module Error in ${this.props.moduleName || 'Component'}`}
              </h3>
              <p className="text-xs text-[#BE123C]">
                An isolated exception occurred in this module. The rest of BioCode Studio remains unaffected and responsive.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 bg-white rounded-xl border border-[#FECDD3] text-[11px] text-[#475569] overflow-x-auto shadow-2xs">
              <div className="font-bold text-[#E11D48] mb-1">Error message:</div>
              <code className="text-[#334155]">{this.state.error.message || String(this.state.error)}</code>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[#FECDD3]/70">
            <span className="text-[11px] text-[#94A3B8]">Click retry to re-initialize this view</span>
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FFE4E6] text-xs font-bold text-[#9F1239] border border-[#FECDD3] shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>Retry Module</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


