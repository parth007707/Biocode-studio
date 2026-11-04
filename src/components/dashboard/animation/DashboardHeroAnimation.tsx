import React, { useState, useEffect, useRef, useCallback, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { ProceduralDnaHelix } from './ProceduralDnaHelix';
import { StaticDnaFallback } from './StaticDnaFallback';

// Re-export StaticDnaFallback for direct access
export { StaticDnaFallback };

interface DashboardHeroAnimationProps {
  className?: string;
}

// Error Boundary specifically for WebGL/Canvas crashes
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class WebGlErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[DashboardHeroAnimation] WebGL Canvas error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const DashboardHeroAnimation: React.FC<DashboardHeroAnimationProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [force3dOnMobile, setForce3dOnMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Detect environment conditions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(motionQuery.matches);

      const handleMotionChange = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
      };
      motionQuery.addEventListener('change', handleMotionChange);

      const checkMobile = () => {
        const isSmallScreen = window.innerWidth < 640;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobileDevice(isSmallScreen || isMobileUA);
      };

      checkMobile();
      window.addEventListener('resize', checkMobile);

      return () => {
        motionQuery.removeEventListener('change', handleMotionChange);
        window.removeEventListener('resize', checkMobile);
      };
    }
  }, []);

  // IntersectionObserver to pause rendering when out of viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldRenderStaticFallback = prefersReducedMotion || (isMobileDevice && !force3dOnMobile);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  if (shouldRenderStaticFallback) {
    return (
      <StaticDnaFallback
        className={className}
        reason={prefersReducedMotion ? 'reduced-motion' : 'mobile'}
        onEnable3D={() => setForce3dOnMobile(true)}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      {/* Subtle Atmospheric Radial Sky/Pink Glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-gradient-to-tr from-[#38BDF8]/15 via-[#8B5CF6]/08 to-transparent blur-2xl" />
      </div>

      {/* WebGL Canvas with Error Boundary and Suspense */}
      <WebGlErrorBoundary
        fallback={
          <StaticDnaFallback
            className={className}
            reason="error"
          />
        }
      >
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-[#050B18]/80 backdrop-blur-xs">
              <div className="flex items-center gap-2 text-xs font-mono text-[#38BDF8]">
                <RefreshCw className="w-4 h-4 animate-spin text-[#38BDF8]" />
                <span>Loading 3D Molecular Simulation...</span>
              </div>
            </div>
          }
        >
          <Canvas
            camera={{ position: [0, 0, 17], fov: 42, near: 0.1, far: 100 }}
            dpr={[1, 1.75]}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'low-power'
            }}
            frameloop={isVisible && !isPaused ? 'always' : 'demand'}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          >
            <ProceduralDnaHelix isPaused={isPaused} />
          </Canvas>
        </Suspense>
      </WebGlErrorBoundary>

      {/* Interactive Play/Pause Control */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={togglePause}
          className="p-1.5 rounded-lg bg-[#0B1930]/85 hover:bg-[#0F2445] border border-[#38BDF8]/25 text-[#94A3B8] hover:text-[#38BDF8] shadow-[0_0_8px_rgba(0,0,0,0.4)] cursor-pointer transition-all active:scale-95"
          title={isPaused ? 'Resume 3D Rotation' : 'Pause 3D Rotation'}
          aria-label={isPaused ? 'Resume 3D Rotation' : 'Pause 3D Rotation'}
        >
          {isPaused ? (
            <Play className="w-3.5 h-3.5 fill-[#38BDF8] text-[#38BDF8]" />
          ) : (
            <Pause className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Scientific Model Footnote */}
      <div className="absolute bottom-2.5 right-3 pointer-events-none z-10 flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-[#94A3B8] bg-[#0B1930]/85 backdrop-blur-xs px-2 py-0.5 rounded-md border border-[#38BDF8]/20 shadow-2xs">
          R3F Procedural Double Helix
        </span>
      </div>
    </div>
  );
};
