import * as vscode from 'vscode';
import { OpenAIService } from './services/openai';
import { FunctionSuggestion } from './types';

export function activate(context: vscode.ExtensionContext) {
    const functionDetector = new FunctionDetector(context);

    const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId !== 'python') return;
        if (!vscode.workspace.getConfiguration('knuth').get('enable')) return;

        functionDetector.analyze(event);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }

class FunctionDetector {
    private lastAnalyzedText: string = '';
    private functionRegex: RegExp = /def\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*:(?:\s*(?:#[^\n]*)?(?:\n\s+[^\n]+|\n\s*(?:#[^\n]*)?)*)*/g;
    private indentationRegex: RegExp = /^[ \t]+/;
    private openAIService: OpenAIService;
    private suggestions: Map<string, FunctionSuggestion> = new Map();
    private readonly lightbulbDecoration: vscode.TextEditorDecorationType;

    constructor(context: vscode.ExtensionContext) {
        const apiKey: string | undefined = vscode.workspace.getConfiguration('knuth').get('openAIKey');
        this.openAIService = new OpenAIService(apiKey);

        // Simpler decoration without the command URI
        this.lightbulbDecoration = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: '💡',
                color: new vscode.ThemeColor('editorLightBulb.foreground'),
                margin: '0 0.5em 0 0'
            }
        });

        // Register command with proper binding
        context.subscriptions.push(
            vscode.commands.registerCommand('knuth.showSuggestion', (functionName: string) => {
                this.showSuggestionModal(functionName);
            })
        );

        // Add mouse click handler
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection(event => {
                this.handleClick(event);
            })
        );
    }

    analyze(event: vscode.TextDocumentChangeEvent) {
        const document: vscode.TextDocument = event.document;
        const text: string = document.getText();

        if (text === this.lastAnalyzedText) return;

        const matches = text.matchAll(this.functionRegex);

        for (const match of matches) {
            const functionBody = match?.[0];

            if (!functionBody) return;

            if (this.isFunctionComplete(functionBody)) {
                this.analyzeFunctionWithAI(functionBody, document.positionAt(match.index!));
            }
        }

        this.lastAnalyzedText = text;
    }

    private isFunctionComplete(functionText: string): boolean {
        const lines: Array<string> = functionText.split('\n');

        if (lines.length < 2) return false;

        const baseIndent = this.getIndentation(lines[1]);
        const lastLineIndent = this.getIndentation(lines[lines.length - 1]);

        return lastLineIndent <= baseIndent;
    }

    private getIndentation(line: string): number {
        const match = line.match(this.indentationRegex);
        return match ? match[0].length : 0;
    }

    // Add new method to handle clicks
    private handleClick(event: vscode.TextEditorSelectionChangeEvent) {
        const position = event.selections[0].active;
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) return;

        const line = editor.document.lineAt(position.line);
        const functionMatch = line.text.match(/def\s+([a-zA-Z_]\w*)/);
        if (!functionMatch) return;

        const functionName = functionMatch[1];
        if (this.suggestions.has(functionName)) {
            this.showSuggestionModal(functionName);
        }
    }

    private async analyzeFunctionWithAI(functionText: string, position: vscode.Position) {
        const suggestion = await this.openAIService.analyzePythonFunction(functionText);
        const functionName = functionText.match(/def\s+([a-zA-Z_]\w*)/)?.[1];

        if (!functionName || !vscode.window.activeTextEditor) return;

        this.suggestions.set(functionName, {
            functionName,
            suggestion,
            range: new vscode.Range(position, position)
        });

        // Calculate position for the light bulb
        const line = vscode.window.activeTextEditor.document.lineAt(position.line);
        const nameMatch = line.text.match(/def\s+([a-zA-Z_]\w*)/);
        if (!nameMatch) return;

        const startPos = line.text.indexOf(nameMatch[1]);
        const decorationRange = new vscode.Range(
            position.line,
            startPos,
            position.line,
            startPos + nameMatch[1].length
        );

        // Simpler decoration without command URI
        vscode.window.activeTextEditor.setDecorations(this.lightbulbDecoration, [{
            range: decorationRange,
            hoverMessage: 'Click to view suggestion'
        }]);
    }

    private async showSuggestionModal(functionName: string) {
        const suggestion = this.suggestions.get(functionName);
        if (!suggestion) return;

        // Create and show a panel
        const panel = vscode.window.createWebviewPanel(
            'suggestionPanel',
            'Code Review Comment (1 of 1)',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Create HTML content that looks like Copilot's suggestion
        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        padding: 10px;
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                        background-color: var(--vscode-editor-background);
                    }
                    .header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 20px;
                    }
                    .header img {
                        width: 24px;
                        height: 24px;
                        margin-right: 10px;
                    }
                    .suggestion {
                        background-color: var(--vscode-editor-background);
                        padding: 10px;
                        margin: 10px 0;
                        border-radius: 4px;
                    }
                    .buttons {
                        margin-top: 20px;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-right: 8px;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>Knuth AI Suggestion</div>
                </div>
                <div class="suggestion">
                    ${suggestion.suggestion.replace(/\n/g, '<br>')}
                </div>
                <div class="buttons">
                    <button onclick="dismiss()">Dismiss</button>
                </div>
                <script>
                    function dismiss() {
                        window.close();
                    }
                </script>
            </body>
            </html>
        `;
    }
}