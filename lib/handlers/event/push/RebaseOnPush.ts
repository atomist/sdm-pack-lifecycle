import {
    GraphQL,
    logger,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    execPromise,
    ParametersDefinition,
    resolveCredentialsPromise,
    SoftwareDeliveryMachineOptions,
} from "@atomist/sdm";
import {
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import {
    PullRequestByRepoAndBranch,
    PushToBranch,
} from "../../../typings/types";

type RebaseOnPushParametersDefinition = { configuration: SoftwareDeliveryMachineOptions } & LifecycleParametersDefinition;

export const RebaseOnPushParameters: ParametersDefinition<RebaseOnPushParametersDefinition> = {

    ...LifecycleParameters,

    configuration: {
        path: "sdm",
        required: false,
    },
};

/**
 * Event handler to automatically rebase a PR branch when pushes to the base branch occur
 */
export const RebaseOnPush: EventHandlerRegistration<PushToBranch.Subscription, RebaseOnPushParametersDefinition> = {
    name: "RebaseOnPush",
    description: "",
    tags: [],
    parameters: RebaseOnPushParameters,
    subscription: GraphQL.subscription("pushToBranch"),
    listener: async (e, ctx, params) => {
        const push = e.data.Push[0];
        // Check if there is an open PR against the branch this push is on
        const prs = await ctx.graphClient.query<PullRequestByRepoAndBranch.Query, PullRequestByRepoAndBranch.Variables>({
            name: "pullRequestByRepoAndBranch",
            variables: {
                owner: push.repo.owner,
                repo: push.repo.name,
                branch: push.branch,
            },
            options: QueryNoCacheOptions,
        });

        if (!!prs && !!prs.PullRequest) {
            const credentials = await resolveCredentialsPromise(params.credentialsResolver.eventHandlerCredentials(ctx));

            for (const pr of prs.PullRequest) {
                await params.configuration.projectLoader.doWithProject<void>(
                    {
                        context: ctx,
                        readOnly: false,
                        id: params.configuration.repoRefResolver.toRemoteRepoRef(pr.repo, {}),
                        credentials,
                        cloneOptions: {
                            alwaysDeep: true,
                            detachHead: false,
                        },
                    }, async p => {
                        try {
                            await execPromise("git", ["checkout", pr.branchName], { cwd: p.baseDir });
                            await execPromise("git", ["rebase", `origin/${pr.baseBranchName}`], { cwd: p.baseDir });
                            await execPromise("git", ["push", "origin", pr.branchName, "--force"], { cwd: p.baseDir });
                        } catch (e) {
                            logger.warn("Failed to rebase PR: %s", e.message);
                        }
                    });
            }
        }

        return Success;
    },
};
