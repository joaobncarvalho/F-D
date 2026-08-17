import { Component } from 'react';

/**
 * Captura erros de render de qualquer ecrã e mostra um painel legível em vez de
 * um ecrã em branco. Facilita reportar bugs: há um botão "Copiar erro" com a
 * mensagem + stack + em que ecrã aconteceu.
 *
 * Os error boundaries do React TÊM de ser class components (não há hook equivalente).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Também no console, para quem preferir.
    console.error('[F&D] erro de render:', error, info?.componentStack);
  }

  report() {
    const { error, info } = this.state;
    const text = [
      `F&D — erro (${this.props.label || 'app'})`,
      `Mensagem: ${error?.message || error}`,
      '',
      'Stack:',
      error?.stack || '(sem stack)',
      '',
      'Componentes:',
      info?.componentStack || '(sem info)',
    ].join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.setState({ copied: true }),
        () => this.setState({ copied: false })
      );
    }
  }

  render() {
    const { error, info, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fd-card p-5 my-4 flex flex-col gap-3 text-left">
        <h1 className="fd-title text-xl font-extrabold text-rose-300">💥 Algo rebentou</h1>
        <p className="text-sm text-white/60">
          O jogo apanhou um erro neste ecrã. Copia-o e envia — assim é fácil corrigir.
        </p>

        <div className="rounded-lg bg-black/40 p-3 overflow-auto max-h-52 text-xs">
          <p className="text-rose-300 font-bold break-words">{error.message || String(error)}</p>
          {info?.componentStack && (
            <pre className="mt-2 text-white/50 whitespace-pre-wrap break-words">
              {info.componentStack.trim()}
            </pre>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={() => this.report()} className="fd-btn fd-btn-primary">
            {copied ? '✓ Erro copiado!' : '📋 Copiar erro'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="fd-btn fd-btn-ghost flex-1 py-2 text-sm"
            >
              🔄 Recarregar
            </button>
            <button
              onClick={() => {
                try {
                  sessionStorage.removeItem('fd_session');
                } catch {
                  /* ignora */
                }
                window.location.href = '/';
              }}
              className="fd-btn fd-btn-ghost flex-1 py-2 text-sm"
            >
              🏠 Início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
