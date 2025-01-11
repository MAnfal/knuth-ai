// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { OpenAIService } from './services/openai';
import { FunctionSuggestion } from './types';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const functionDetector = new FunctionDetector(context);

	const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document.languageId !== 'python') return;
		if (!vscode.workspace.getConfiguration('knuth').get('enable')) return;

		functionDetector.analyze(event);
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

class FunctionDetector {
	private lastAnalyzedText: string = '';
	private functionRegex: RegExp = /def\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*:(?:\s*(?:#[^\n]*)?(?:\n\s+[^\n]+|\n\s*(?:#[^\n]*)?)*)*/g;
	private indentationRegex: RegExp = /^[ \t]+/;
	private openAIService: OpenAIService;
	private suggestions: Map<string, FunctionSuggestion> = new Map();
	private readonly lightbulbDecoration: vscode.TextEditorDecorationType;

	constructor(context: vscode.ExtensionContext) {
		const apiKey: string|undefined = vscode.workspace.getConfiguration('knuth').get('openAIKey');
	
		this.openAIService = new OpenAIService(apiKey);

		context.subscriptions.push(
			vscode.commands.registerCommand('knuth.showSuggestion', this.showSuggestionModal.bind(this))
		);

		context.subscriptions.push(
			vscode.languages.registerHoverProvider('python', {
				provideHover: this.provideHover.bind(this)
			})
		)

		this.lightbulbDecoration = vscode.window.createTextEditorDecorationType({
            gutterIconPath: context.asAbsolutePath('resources/lightbulb.svg'),
            gutterIconSize: '16px'
        });
	}

	analyze(event: vscode.TextDocumentChangeEvent) {
		const document: vscode.TextDocument = event.document;
		const text: string = document.getText();

		if (text === this.lastAnalyzedText) return;

		const matches: RegExpStringIterator<RegExpExecArray> = text.matchAll(this.functionRegex);

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

	private async analyzeFunctionWithAI(functionText: string, position: vscode.Position) {
		const suggestion = await this.openAIService.analyzePythonFunction(functionText);
		const functionName = functionText.match(/def\s+([a-zA-Z_]\w*)/)?.[1];

		if (!functionName) return;

		this.suggestions.set(functionName, {
			functionName,
			suggestion,
			range: new vscode.Range(position, position)
		});

		this.showLightbulb(vscode.window.activeTextEditor?.document, position);
	}

	private showLightbulb(document: vscode.TextDocument|undefined, position: vscode.Position) {
        if (!document) return;
		
		const editor = vscode.window.activeTextEditor;
        
		if (editor && editor.document === document) {
			const functionName = document.lineAt(position.line).text.match(/def\s+([a-zA-Z_]\w*)/)?.[1];
			
			if (functionName) {
				const suggestion = this.suggestions.get(functionName);
				const decorationOptions: vscode.DecorationOptions[] = [{
					range: new vscode.Range(position, position),
					hoverMessage: new vscode.MarkdownString('📝 Click for suggestion')
				}];
				editor.setDecorations(this.lightbulbDecoration, decorationOptions);
			}
		}
    }

	private provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
		const line = document.lineAt(position);

		const functionName = line.text.match(/def\s+([a-zA-Z_]\w*)/)?.[1];

		if (!functionName || this.suggestions.has(functionName)) return;

		const suggestion = this.suggestions.get(functionName);

		return new vscode.Hover(`💡 ${suggestion?.suggestion}`);
	}

	private async showSuggestionModal(suggestion: FunctionSuggestion) {
		const result = await vscode.window.showInformationMessage(
			suggestion.suggestion,
			{ modal: true },
			{ title: 'Got it!' }
		);
	}
}