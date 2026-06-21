import { genkit } from "@genkit-ai/core";
import { googleAI } from "@genkit-ai/googleai";
import { defineFlow, startFlowsServer } from "@genkit-ai/flow";
import { engineeringChatFlow } from "./flows/engineering-chat.flow";

// Initialize Genkit
genkit({
    plugins: [googleAI()],
    flows: [engineeringChatFlow],
});

startFlowsServer();
