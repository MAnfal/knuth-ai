import * as vscode from 'vscode';

export interface FunctionSuggestion {
    functionName: string;
    suggestion: string;
    range: vscode.Range;
}