import { CommandHandlerRegistration } from "@atomist/sdm";

export function reviewComplianceCommand(): CommandHandlerRegistration<{ owner: string, repo: string, branch: string, sha: string }> {
    return {
        name: "ReviewCompliance",
        description: "Render compliance review messages in chat",
        parameters: {
            owner: {},
            repo: {},
            branch: {},
            sha: {},
        },
        listener: async ci => {
            await ci.context.messageClient.respond("test", { thread: true });
        },
    };
}
