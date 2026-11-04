import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/'
});

// Setup globals
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).HTMLCanvasElement = dom.window.HTMLCanvasElement;
(global as any).Element = dom.window.Element;
(global as any).Node = dom.window.Node;
(global as any).localStorage = dom.window.localStorage;
(global as any).sessionStorage = dom.window.sessionStorage;
(global as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(global as any).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(global as any).requestAnimationFrame = (cb: Function) => setTimeout(cb, 16);
(global as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
(global as any).matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {}
});

const maxUpdateErrors: string[] = [];
const origError = console.error;
console.error = (...args: any[]) => {
  const msg = args.join(' ');
  if (msg.includes('Maximum update depth exceeded')) {
    maxUpdateErrors.push(msg);
  }
  origError(...args);
};

async function test() {
  const React = await import('react');
  const ReactDOMClient = await import('react-dom/client');
  const App = (await import('../src/App')).default;
  const { ProjectsView } = await import('../src/components/projects/ProjectsView');
  const { ProjectDetailView } = await import('../src/components/projects/ProjectDetailView');
  const { HistoryView } = await import('../src/components/history/HistoryView');
  const { AnalysisDetailView } = await import('../src/components/history/AnalysisDetailView');
  const { AIAssistantView } = await import('../src/components/ai/AIAssistantView');
  const { SettingsView } = await import('../src/components/settings/SettingsView');
  const { BioSequenceProvider } = await import('../src/context/BioSequenceContext');
  const { SequenceEditorWorkspace } = await import('../src/components/analysis/editor/SequenceEditorWorkspace');
  const { ResidueWhatIfSimulator } = await import('../src/components/analysis/ResidueWhatIfSimulator');
  const { StructureStudioModal } = await import('../src/components/analysis/structure3d/StructureStudioModal');
  const { DatabaseSourceView } = await import('../src/components/analysis/explorer/DatabaseSourceView');

  const rootEl = dom.window.document.getElementById('root')!;
  const root = ReactDOMClient.createRoot(rootEl);

  console.log('Testing App mounted on "/"');
  root.render(React.createElement(App));
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing ProjectsView');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(ProjectsView, { user: { id: 'test_user' }, onOpenAuth: () => {} })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing ProjectDetailView');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(ProjectDetailView, { projectId: 'proj_1', onBackToList: () => {}, onOpenWorkbench: () => {}, user: { id: 'test_user' } })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing HistoryView');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(HistoryView, { user: { id: 'test_user' }, onOpenAuth: () => {} })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing AnalysisDetailView');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(AnalysisDetailView, { analysisId: 'ana_1', onBack: () => {}, user: { id: 'test_user' } })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing AIAssistantView');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(AIAssistantView, { user: { id: 'test_user' }, activeContext: null })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing AIAssistantView with activeContext');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(AIAssistantView, {
        user: { id: 'test_user' },
        activeContext: {
          type: 'sequence',
          accession: 'NP_000537',
          sequenceData: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD'
        } as any
      })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing SettingsView');
  root.render(React.createElement(SettingsView));
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing ResidueWhatIfSimulator');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(ResidueWhatIfSimulator)
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  console.log('Testing SequenceEditorWorkspace');
  root.render(
    React.createElement(BioSequenceProvider, null,
      React.createElement(SequenceEditorWorkspace, {
        originalSequence: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
        sequenceType: 'PROTEIN',
        onClose: () => {},
        onAnalysisCompleted: () => {}
      })
    )
  );
  await new Promise(r => setTimeout(r, 1000));

  if (maxUpdateErrors.length > 0) {
    console.error('FAILED! Maximum update depth exceeded caught:');
    maxUpdateErrors.forEach(err => console.error(err));
    process.exit(1);
  } else {
    console.log('ALL VIEWS PASSED WITHOUT MAXIMUM UPDATE DEPTH ERRORS!');
    process.exit(0);
  }
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
