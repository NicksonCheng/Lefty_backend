import dotenv from "dotenv";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getLatestWorkflowStatus, triggerDeploy } from "./tools/github";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Tool Definitions
const tools = [
  {
    functionDeclarations: [
      {
        name: "check_ci_status",
        description: "Returns the latest build status of the CI/CD workflow.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: "Repository owner" },
            repo: { type: SchemaType.STRING, description: "Repository name" },
          },
          required: ["owner", "repo"],
        } as any,
      },
      {
        name: "trigger_deploy",
        description: "Triggers a new deployment workflow.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: "Repository owner" },
            repo: { type: SchemaType.STRING, description: "Repository name" },
            branch: {
              type: SchemaType.STRING,
              description: "Branch to deploy, defaults to 'main'",
            },
          },
          required: ["owner", "repo"],
        } as any,
      },
    ],
  },
];

const model = genAI.getGenerativeModel({
  model: "gemini-3-flash-preview",
  tools: tools,
});

// Map tool names to functions
const toolFunctions: Record<string, Function> = {
  check_ci_status: getLatestWorkflowStatus,
  trigger_deploy: triggerDeploy,
};

export async function runAgent(userPrompt: string) {
  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [
          {
            text: "You are a Senior DevOps assistant. Help me manage my CI/CD pipelines. Briefly explain your actions.",
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Understood. I am ready to assist you with your DevOps tasks.",
          },
        ],
      },
    ],
  });

  try {
    let result = await chat.sendMessage(userPrompt);
    let response = result.response;
    let functionCalls = response.functionCalls();

    while (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const { name, args } = call;
      const fn = toolFunctions[name];

      if (fn) {
        console.log(`[Agent] Calling tool: ${name}`);

        let toolResult;
        // Explicitly typing args as any for simplicity in this dynamic context,
        // or we could cast to specific interfaces.
        const toolArgs = args as any;

        if (name === "check_ci_status") {
          toolResult = await fn(toolArgs.owner, toolArgs.repo);
        } else if (name === "trigger_deploy") {
          toolResult = await fn(
            toolArgs.owner,
            toolArgs.repo,
            toolArgs.branch || "main",
          );
        }

        // Send the result back to the model
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: name,
              response: {
                name: name,
                content: { result: toolResult },
              },
            },
          },
        ]);
        response = result.response;
        functionCalls = response.functionCalls();
      } else {
        console.error(`Unknown tool called: ${name}`);
        break;
      }
    }

    return response.text();
  } catch (error) {
    console.error("Error in agent run:", error);
    return "An error occurred while processing your request.";
  }
}

// CLI Entry
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.log(
        'Please provide a prompt. Usage: npx ts-node src/agent.ts "Check CI status for owner/repo"',
      );
      return;
    }
    const prompt = args.join(" ");
    console.log(`User Prompt: "${prompt}"`);
    const response = await runAgent(prompt);
    console.log("\nAgent Response:\n" + response);
  })();
}
