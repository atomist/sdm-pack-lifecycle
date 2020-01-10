/*
 * Copyright © 2019 Atomist, Inc.
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

import { MappedParameters } from "@atomist/automation-client/lib/decorators";
import { slackSuccessMessage } from "@atomist/sdm/lib/api-helper/misc/slack/messages";
import { actionableButton } from "@atomist/sdm/lib/api/command/support/buttons";
import { CommandHandlerRegistration } from "@atomist/sdm/lib/api/registration/CommandHandlerRegistration";
import { DeclarationType } from "@atomist/sdm/lib/api/registration/ParametersDefinition";
import {
    Action,
    bold,
} from "@atomist/slack-messages";
import {
    AbstractIdentifiableContribution,
    RendererContext,
    SlackActionContributor,
} from "../../lib/lifecycle/Lifecycle";
import { PushToPushLifecycle } from "../../lib/typings/types";
import {
    CommitMessageWarningPushNodeRenderer,
    DismissedPreferenceKey,
    isDismissed,
} from "./renderer";

/**
 * ActionContributor adding a button to dismiss the commit message warnings
 */
export class CommitMessageWarningPushActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<PushToPushLifecycle.Push> {

    constructor() {
        super("dismiss_commit_message");
    }

    public supports(node: any, rc: RendererContext): boolean {
        return !!node.after && rc.rendererId === CommitMessageWarningPushNodeRenderer.ID;
    }

    public async buttonsFor(node: PushToPushLifecycle.Push,
                            rc: RendererContext): Promise<Action[]> {

        if (!(await isDismissed(node, rc))) {
            return [
                actionableButton(
                    { text: "Dismiss" },
                    DismissCommitMessageWarningCommand,
                    {
                        owner: node.repo.owner,
                        repo: node.repo.name,
                    }),
            ];
        }

        return [];
    }

    public async menusFor(node: PushToPushLifecycle.Push,
                          rc: RendererContext): Promise<Action[]> {
        return [];
    }
}

/**
 * Command to dismiss the commit message warnings
 */
export const DismissCommitMessageWarningCommand: CommandHandlerRegistration<{ owner: string, repo: string }> = {
    name: "DismissCommitMessageWarningCommand",
    description: "Dismiss the commit message format warnings",
    parameters: {
        owner: { uri: MappedParameters.GitHubOwner, declarationType: DeclarationType.Mapped },
        repo: { uri: MappedParameters.GitHubRepository, declarationType: DeclarationType.Mapped },
    },
    listener: async ci => {
        const slug = `${ci.parameters.owner}/${ci.parameters.repo}`;
        await ci.preferences.put<boolean>(
            DismissedPreferenceKey,
            true,
            { scope: slug });
        await ci.context.messageClient.respond(
            slackSuccessMessage(
                "Dismiss Commit Format Warnings",
                `Successfully dismissed all future commit message format warnings for ${bold(slug)}`));
    },
};
