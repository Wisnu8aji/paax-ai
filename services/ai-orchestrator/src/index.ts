import { configureGenkit, googleAI, startFlowsServer } from './genkit-placeholder';



import { engineeringChatFlow } from "./flows/engineering-chat.flow";

// Initialize Genkit
configureGenkit({
    plugins: [googleAI()],
    flows: [engineeringChatFlow],
});

startFlowsServer();
