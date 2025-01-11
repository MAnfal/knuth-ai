// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const functionDetector = new FunctionDetector();

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

	private analyzeFunctionWithAI(functionText: string, position: vscode.Position) {

	}
}