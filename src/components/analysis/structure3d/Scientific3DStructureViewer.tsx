import React, { useEffect, useRef, useState } from 'react';
import {
  ResolvedStructure3D,
  RepresentationMode,
  ColorScheme,
  AtomicCoordinate
} from '../../../lib/bio/structure3d/types';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCw,
  Crosshair,
  RotateCcw,
  Info,
  CheckCircle2
} from 'lucide-react';

export interface Scientific3DStructureViewerProps {
  structure: ResolvedStructure3D;
  initialRepresentation?: RepresentationMode;
  initialColorScheme?: ColorScheme;
  representation?: RepresentationMode;
  colorScheme?: ColorScheme;
  onSelectResidue?: (resSeq: number) => void;
  selectedResSeq?: number | null;
  className?: string;
  enableControls?: boolean;
  resetTrigger?: number;
  centerTrigger?: number;
  zoomInTrigger?: number;
  zoomOutTrigger?: number;
  backgroundColor?: string | number;
}

function generatePdbFromStructure(structure: ResolvedStructure3D): string {
  if (structure.rawPdbText && structure.rawPdbText.includes('ATOM')) {
    return structure.rawPdbText;
  }
  let pdb = '';
  let atomSerial = 1;
  const atoms = structure.allAtoms || [];
  for (const atom of atoms) {
    const recordName = atom.isHetatm ? 'HETATM' : 'ATOM';
    const serial = String(atom.id || atomSerial++).padStart(5, ' ');
    const name = (atom.name || atom.element || 'C').padEnd(4, ' ');
    const resName = (atom.residueName || 'ALA').padStart(3, ' ');
    const chainId = (atom.chainId || 'A').padEnd(1, ' ');
    const resSeq = String(atom.resSeq || 1).padStart(4, ' ');
    const x = Number(atom.x || 0).toFixed(3).padStart(8, ' ');
    const y = Number(atom.y || 0).toFixed(3).padStart(8, ' ');
    const z = Number(atom.z || 0).toFixed(3).padStart(8, ' ');
    const occ = Number(atom.occupancy ?? 1.0).toFixed(2).padStart(6, ' ');
    const temp = Number(atom.tempFactor ?? 20.0).toFixed(2).padStart(6, ' ');
    const elem = (atom.element || 'C').padStart(2, ' ');
    pdb += `${recordName} ${serial} ${name} ${resName} ${chainId}${resSeq}    ${x}${y}${z}${occ}${temp}          ${elem}\n`;
  }
  return pdb || 'ATOM      1  CA  ALA A   1     0.000   0.000   0.000  1.00 20.00           C\n';
}

export const Scientific3DStructureViewer: React.FC<Scientific3DStructureViewerProps> = ({
  structure,
  initialRepresentation = 'ball_and_stick',
  initialColorScheme = 'element',
  representation: controlledRepresentation,
  colorScheme: controlledColorScheme,
  onSelectResidue,
  selectedResSeq,
  className = '',
  enableControls = true,
  resetTrigger,
  centerTrigger,
  zoomInTrigger,
  zoomOutTrigger,
  backgroundColor = '#000000'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [representation, setRepresentation] = useState<RepresentationMode>(controlledRepresentation || initialRepresentation);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(controlledColorScheme || initialColorScheme);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Sync controlled props
  useEffect(() => {
    if (controlledRepresentation) setRepresentation(controlledRepresentation);
  }, [controlledRepresentation]);

  useEffect(() => {
    if (controlledColorScheme) setColorScheme(controlledColorScheme);
  }, [controlledColorScheme]);

  // Initialize 3Dmol viewer
  useEffect(() => {
    const domEl = containerRef.current;
    if (!domEl || !structure) return;

    const $3Dmol = (window as any).$3Dmol;
    if (!$3Dmol) {
      console.warn('3Dmol.js not loaded on window.');
      return;
    }

    // Clear container
    domEl.innerHTML = '';

    try {
      const viewer = $3Dmol.createViewer(domEl, {
        backgroundColor: '#000000',
        antialias: true
      });
      viewerRef.current = viewer;

      const pdbText = generatePdbFromStructure(structure);
      viewer.addModel(pdbText, 'pdb');

      applyStyles(viewer, representation, colorScheme, $3Dmol);

      viewer.zoomTo();
      viewer.render();
      setIsInitialized(true);

      const handleResize = () => {
        if (viewer && typeof viewer.resize === 'function') {
          viewer.resize();
          viewer.render();
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        try {
          viewer.clear();
        } catch {}
      };
    } catch (e) {
      console.error('Failed to initialize 3Dmol viewer:', e);
    }
  }, [structure]);

  // Update representation or color scheme
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isInitialized) return;
    const $3Dmol = (window as any).$3Dmol;
    if (!$3Dmol) return;

    applyStyles(viewer, representation, colorScheme, $3Dmol);
    viewer.render();
  }, [representation, colorScheme, isInitialized]);

  // Trigger handlers
  useEffect(() => {
    if (viewerRef.current && resetTrigger !== undefined && resetTrigger > 0) {
      viewerRef.current.zoomTo();
      viewerRef.current.render();
    }
  }, [resetTrigger]);

  useEffect(() => {
    if (viewerRef.current && centerTrigger !== undefined && centerTrigger > 0) {
      viewerRef.current.center();
      viewerRef.current.render();
    }
  }, [centerTrigger]);

  useEffect(() => {
    if (viewerRef.current && zoomInTrigger !== undefined && zoomInTrigger > 0) {
      viewerRef.current.zoom(0.8);
      viewerRef.current.render();
    }
  }, [zoomInTrigger]);

  useEffect(() => {
    if (viewerRef.current && zoomOutTrigger !== undefined && zoomOutTrigger > 0) {
      viewerRef.current.zoom(1.25);
      viewerRef.current.render();
    }
  }, [zoomOutTrigger]);

  // Auto-rotate toggle
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (autoRotate) {
      viewer.spin('y', 1);
    } else {
      viewer.spin(false);
    }
  }, [autoRotate]);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div 
      ref={wrapperRef}
      className={`relative w-full h-full bg-black flex flex-col overflow-hidden select-none ${className}`}
    >
      {/* 3Dmol Container - Pure Black Background */}
      <div 
        ref={containerRef}
        className="w-full h-full min-h-[460px] flex-1 bg-black cursor-grab active:cursor-grabbing"
        style={{ backgroundColor: '#000000' }}
      />

      {/* Floating Control Toolbar */}
      {enableControls && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-neutral-900/90 backdrop-blur-md p-1 rounded-xl border border-neutral-700 text-neutral-200 shadow-xl">
          <button
            type="button"
            onClick={() => {
              if (viewerRef.current) {
                viewerRef.current.zoom(0.8);
                viewerRef.current.render();
              }
            }}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (viewerRef.current) {
                viewerRef.current.zoom(1.25);
                viewerRef.current.render();
              }
            }}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAutoRotate(!autoRotate);
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${autoRotate ? 'bg-sky-600 text-white' : 'hover:bg-neutral-800 text-neutral-300'}`}
            title="Toggle Auto-Rotation"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (viewerRef.current) {
                viewerRef.current.zoomTo();
                viewerRef.current.render();
              }
            }}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Reset Camera View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Bottom Floating Legend / Status */}
      <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-neutral-700 text-[11px] font-mono text-neutral-300 shadow-xl">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>3Dmol.js WebGL Engine (Pure Black Background #000000)</span>
      </div>
    </div>
  );
};

function applyStyles(viewer: any, representation: RepresentationMode, colorScheme: ColorScheme, $3Dmol: any) {
  viewer.removeAllStyles();

  let colorSpec: any = { color: 'spectrum' };
  if (colorScheme === 'element') {
    colorSpec = { color: 'element' };
  } else if (colorScheme === 'secondary_structure') {
    colorSpec = { colors: ['magenta', 'yellow', 'cyan', 'green'] };
  } else if (colorScheme === 'hydrophobicity') {
    colorSpec = { color: 'hydrophobicity' };
  } else if (colorScheme === 'plddt_bfactor') {
    colorSpec = { color: 'bfactor' };
  } else if (colorScheme === 'rainbow_spectrum') {
    colorSpec = { color: 'spectrum' };
  } else if (colorScheme === 'mutation_delta') {
    colorSpec = { color: 'red' };
  }

  if (representation === 'ball_and_stick') {
    viewer.setStyle({}, {
      stick: { radius: 0.15, ...colorSpec },
      sphere: { radius: 0.35, ...colorSpec }
    });
  } else if (representation === 'ribbon') {
    viewer.setStyle({}, {
      cartoon: { ...colorSpec }
    });
  } else if (representation === 'backbone_trace') {
    viewer.setStyle({}, {
      line: { ...colorSpec }
    });
  } else if (representation === 'space_fill') {
    viewer.setStyle({}, {
      sphere: { ...colorSpec }
    });
  } else if (representation === 'surface') {
    viewer.setStyle({}, { cartoon: { ...colorSpec } });
    viewer.addSurface($3Dmol.VDW, { opacity: 0.85, ...colorSpec });
  } else {
    viewer.setStyle({}, { cartoon: { ...colorSpec } });
  }
}
