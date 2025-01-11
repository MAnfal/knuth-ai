import OpenAI from "openai";

export class OpenAIService {
    private client: OpenAI;

    constructor(apiKey: string|undefined) {
        if (!apiKey) {
            apiKey = "DEFAULT_KEY";
        } 

        this.client = new OpenAI({ apiKey });
    }

    async analyzePythonFunction(functionCode: string): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a Python expert. Analyze the following function and suggest improvements for: efficiency, readability, and best practices. Be concise."
                    },
                    {
                        role: "user",
                        content: functionCode
                    }
                ],
                temperature: 0.7
            });

            return response?.choices?.[0]?.message?.content || "No suggestions available";
        } catch (error) {
            throw new Error(`OpenAI API eror: ${JSON.stringify(error)}`);
        }
    }
}