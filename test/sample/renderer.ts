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

import { configurationValue } from "@atomist/automation-client";
import { PreferenceStoreFactory } from "@atomist/sdm";
import {
    Action,
    Attachment,
    SlackMessage,
} from "@atomist/slack-messages";
import {
    AbstractIdentifiableContribution,
    RendererContext,
    SlackNodeRenderer,
} from "../../lib/lifecycle/Lifecycle";
import { PushToPushLifecycle } from "../../lib/typings/types";

/**
 * NodeRenderer implementation that verifies the format of a commit message and
 * adds a Slack attachment showing all format warnings.
 */
export class CommitMessageWarningPushNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<PushToPushLifecycle.Push> {

    public static ID: string = "commit_message";

    constructor() {
        super(CommitMessageWarningPushNodeRenderer.ID);
    }

    public supports(node: PushToPushLifecycle.Push): boolean {
        return !!node.after;
    }

    public async render(node: PushToPushLifecycle.Push,
                        actions: Action[],
                        msg: SlackMessage,
                        rc: RendererContext): Promise<SlackMessage> {

        if (await isDismissed(node, rc)) {
            return msg;
        }

        const warnings: string[] = [];

        const commitMsg = node.after.message;
        const firstRow = commitMsg.split("\n")[0];

        if (firstRow.charAt(0) !== firstRow.charAt(0).toUpperCase()) {
            warnings.push(`Message doesn't start with an uppercase letter`);
        }
        if (firstRow.length > 50) {
            warnings.push(`First row is longer than 50 characters`);
        }

        if (warnings.length > 0) {
            const attachment: Attachment = {
                author_icon: `https://images.atomist.com/rug/warning-yellow.png`,
                author_name: "Commit Message Format",
                text: `Commit message violates our format policy:\n\n${warnings.map(w => ` * ${w}`).join("\n")}`,
                fallback: "Commit Message Format",
                color: "#D7B958",
                mrkdwn_in: ["text"],
                actions,
            };
            msg.attachments.push(attachment);
        }

        return msg;
    }

}

export const DismissedPreferenceKey = `@atomist/lifecycle.dismiss.${CommitMessageWarningPushNodeRenderer.ID}`;

export async function isDismissed(push: Pick<PushToPushLifecycle.Push, "repo">,
                                  rc: RendererContext): Promise<boolean> {
    const psf = configurationValue<PreferenceStoreFactory>("sdm.preferenceStoreFactory");
    if (!!psf) {
        return psf(rc.context).get<boolean>(
            DismissedPreferenceKey,
            { scope: `${push.repo.owner}/${push.repo.name}`, defaultValue: false });
    } else {
        return false;
    }
}
