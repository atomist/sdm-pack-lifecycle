/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    CommandHandler,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client/lib/decorators";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import {
    failure,
    HandlerResult,
    Success,
} from "@atomist/automation-client/lib/HandlerResult";
import {
    bold,
    channel,
    codeLine,
    SlackMessage,
} from "@atomist/slack-messages";
import {
    InviteUserToSlackChannel,
    KickUserFromSlackChannel,
} from "../../../typings/types";
import {
    DefaultGitHubApiUrl,
    DefaultGitHubProviderId,
} from "../../../util/gitHubApi";
import { warning } from "../../../util/messages";
import { isChannel } from "../../../util/slack";
import { extractScreenNameFromMapRepoMessageId } from "../../event/push/PushToUnmappedRepo";
import { addBotToSlackChannel } from "./AddBotToChannel";
import { linkSlackChannelToRepo } from "./LinkRepo";

export function checkRepo(
    url: string,
    providerId: string,
    name: string,
    owner: string,
    ctx: HandlerContext,
): Promise<boolean> {

    /*return ctx.graphClient.query<RepoByNameOwnerAndProviderId.Query, RepoByNameOwnerAndProviderId.Variables>({
            name: "repoByNameOwnerAndProviderId",
            variables: {
                owner,
                name,
                providerId,
            },
            options: QueryNoCacheOptions,
        }).
        then(result => {
            if (_.get(result, "Repo[0].org.provider.providerId")) {
                return true;
            } else {
                return false;
            }
        });*/
    return Promise.resolve(true);
}

export function noRepoMessage(repo: string, owner: string, ctx: HandlerContext): SlackMessage {
    return warning(
        "Link Repository",
        `The repository ${codeLine(`${owner}/${repo}`)} either does not exist or you do not have access to it.`,
        ctx);
}

export function inviteUserToSlackChannel(
    ctx: HandlerContext,
    teamId: string,
    channelId: string,
    userId: string,
): Promise<InviteUserToSlackChannel.Mutation> {

    return ctx.graphClient.mutate<InviteUserToSlackChannel.Mutation,
        InviteUserToSlackChannel.Variables>({
            name: "inviteUserToSlackChannel",
            variables: {
                teamId,
                channelId,
                userId,
            },
        });
}

export function kickUserFromSlackChannel(
    ctx: HandlerContext,
    teamId: string,
    channelId: string,
    userId: string,
): Promise<InviteUserToSlackChannel.Mutation> {

    return ctx.graphClient.mutate<KickUserFromSlackChannel.Mutation,
        KickUserFromSlackChannel.Variables>({
        name: "kickUserFromSlackChannel",
        variables: {
            teamId,
            channelId,
            userId,
        },
    });
}

@CommandHandler("Invite bot, link a repository, and invite user to channel")
@Tags("slack", "repo")
export class AssociateRepo implements HandleCommand {

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public channelId: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public channelName: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    @MappedParameter(MappedParameters.GitHubRepositoryProvider)
    public provider: string;

    @MappedParameter(MappedParameters.SlackUser)
    public userId: string;

    @Parameter({
        displayName: "Repository Name",
        description: "name of the repository to link",
        pattern: /^[-.\w]+$/,
        minLength: 1,
        maxLength: 100,
        required: true,
    })
    public repo: string;

    @Parameter({ displayable: false, required: false })
    public msgId: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        if (!this.channelName) {
            const err = "No channel name was provided when invoking this command.";
            return ctx.messageClient.respond(err)
                .then(() => Success, failure);
        }
        if (!isChannel(this.channelId)) {
            const err = "The Atomist Bot can only link repositories to public channels. " +
                "Please try again with a public channel.";
            return ctx.messageClient.respond(err, { dashboard: false })
                .then(() => Success, failure);
        }
        const apiUrl = (this.apiUrl) ? this.apiUrl : DefaultGitHubApiUrl;
        const providerId = (this.provider) ? this.provider : DefaultGitHubProviderId;
        return checkRepo(apiUrl, providerId, this.repo, this.owner, ctx)
            .then(repoExists => {
                if (!repoExists) {
                    return ctx.messageClient.respond(noRepoMessage(this.repo, this.owner, ctx), { dashboard: false });
                }
                return addBotToSlackChannel(ctx, this.teamId, this.channelId)
                    .then(() => linkSlackChannelToRepo(ctx, this.teamId, this.channelId, this.channelName, this.repo,
                        this.owner, providerId))
                    .then(() => inviteUserToSlackChannel(ctx, this.teamId, this.channelId, this.userId))
                    .then(() => {
                        const msg = `Linked ${bold(this.owner + "/" + this.repo)} to ` +
                            `${channel(this.channelId)} and invited you to the channel.`;
                        const screenName = extractScreenNameFromMapRepoMessageId(this.msgId);
                        if (screenName) {
                            return ctx.messageClient.addressUsers(
                                msg, screenName, { id: this.msgId, dashboard: false });
                        } else {
                            return ctx.messageClient.respond(msg, { dashboard: false });
                        }
                    });
            })
            .then(() => Success, failure);
    }

}
