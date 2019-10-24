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

import {
    Action,
    codeLine,
    italic,
    SlackMessage,
    url,
} from "@atomist/slack-messages";
import * as pluralize from "pluralize";
import {
    AbstractIdentifiableContribution,
    LifecycleConfiguration,
    RendererContext,
    SlackNodeRenderer,
} from "../../../../lifecycle/Lifecycle";
import {
    PushToPushLifecycle,
    SdmGoalFieldsFragment,
    SdmGoalSet,
    SdmGoalState,
} from "../../../../typings/types";
import { lastGoalSet } from "../../../../util/goals";
import {
    branchUrl,
    commitIcon,
    commitUrl,
    repoSlug,
    truncateCommitMessage,
    userUrl,
} from "../../../../util/helpers";
import { EMOJI_SCHEME } from "../../push/rendering/PushNodeRenderers";

export class SimplePushNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<PushToPushLifecycle.Push> {

    public emojiStyle: "default" | "atomist";

    constructor() {
        super("simple_push");
    }

    public configure(configuration: LifecycleConfiguration) {
        this.emojiStyle = configuration.configuration["emoji-style"] || "default";
    }

    public supports(node: any): boolean {
        return node.after;
    }

    public async render(push: PushToPushLifecycle.Push, actions: Action[], msg: SlackMessage,
                        context: RendererContext): Promise<SlackMessage> {
        const repo = context.lifecycle.extract("repo");
        const goalSets = context.lifecycle.extract("goalSets") as SdmGoalSet[];

        let text = `${url(userUrl(repo, push.after.author.login), push.after.author.login)} pushed ${
            codeLine(url(commitUrl(repo, push.after), push.after.sha.slice(0, 7)))} ${italic(truncateCommitMessage(push.after.message, repo))}`;
        if (push.commits.length > 1) {
            text += `and ${pluralize("commit", push.commits.length - 1, true)}`;
        }

        let color;
        const allGoals = (push.goals || []).filter(g => goalSets.some(gs => gs.goalSetId === g.goalSetId));
        if (allGoals.length > 0) {
            const last = lastGoalSet(allGoals);
            const link = `https://app.atomist.com/workspace/${context.context.workspaceId}/goalset/${last[0].goalSetId}`;

            const state = getOverallState(allGoals);
            const icon = getOverallEmoji(state, this.emojiStyle);
            const label = getStateLabel(state);
            color = getOverallColor(state);
            const goals = allGoals.filter(g => g.state === state);

            let goalText = ` \u00B7 ${icon} `;
            if (goals.length > 2) {
                goalText += url(link, `${pluralize("goal", goals.length, true)} ${label}`);
            } else {
                goalText += url(link, `${goals.map(g => italic(g.name)).join(", ")} ${label}`);
            }

            text += goalText;
        }

        msg.text = text;
        msg.attachments.push({
            text: "",
            fallback: "",
            color,
            footer_icon: commitIcon(repo),
            footer: url(branchUrl(repo, push.branch), `${repoSlug(repo)}/${push.branch}`),
            ts: Math.floor(+context.lifecycle.timestamp / 1000),
        });

        return msg;
    }
}

function getOverallState(goals: SdmGoalFieldsFragment[]): SdmGoalState {
    let state: SdmGoalState;
    if (goals.some(g => g.state === SdmGoalState.failure)) {
        state = SdmGoalState.failure;
    } else if (goals.some(g => g.state === SdmGoalState.in_process)) {
        state = SdmGoalState.in_process;
    } else if (goals.some(g => g.state === SdmGoalState.waiting_for_approval)) {
        state = SdmGoalState.waiting_for_approval;
    } else if (goals.some(g => g.state === SdmGoalState.approved)) {
        state = SdmGoalState.approved;
    } else if (goals.some(g => g.state === SdmGoalState.waiting_for_pre_approval)) {
        state = SdmGoalState.waiting_for_pre_approval;
    } else if (goals.some(g => g.state === SdmGoalState.pre_approved)) {
        state = SdmGoalState.pre_approved;
    } else if (goals.some(g => g.state === SdmGoalState.stopped)) {
        state = SdmGoalState.stopped;
    } else if (goals.some(g => g.state === SdmGoalState.canceled)) {
        state = SdmGoalState.canceled;
    } else if (goals.some(g => g.state === SdmGoalState.requested)) {
        state = SdmGoalState.requested;
    } else if (goals.some(g => g.state === SdmGoalState.planned)) {
        state = SdmGoalState.planned;
    } else if (goals.some(g => g.state === SdmGoalState.success)) {
        state = SdmGoalState.success;
    }
    return state;
}

function getOverallColor(state: SdmGoalState): string {
    let color;
    if (state === SdmGoalState.failure) {
        color = "#BC3D33";
    } else if (state ===  SdmGoalState.in_process) {
        color = "#2A7D7D";
    } else if (state ===  SdmGoalState.requested) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.waiting_for_approval) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.approved) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.waiting_for_pre_approval) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.pre_approved) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.stopped) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.canceled) {
        color = "#B5B5B5";
    } else if (state ===  SdmGoalState.planned) {
        color = "#D7B958";
    } else if (state ===  SdmGoalState.success) {
        color = "#37A745";
    }
    return color;
}

function getOverallEmoji(state: SdmGoalState, emojiStyle: string): string {
    switch (state) {
        case SdmGoalState.planned:
        case SdmGoalState.requested:
            return EMOJI_SCHEME[emojiStyle].build.requested;
        case SdmGoalState.in_process:
            return EMOJI_SCHEME[emojiStyle].build.started;
        case SdmGoalState.approved:
        case SdmGoalState.waiting_for_approval:
            return EMOJI_SCHEME[emojiStyle].build.approval;
        case SdmGoalState.pre_approved:
        case SdmGoalState.waiting_for_pre_approval:
            return EMOJI_SCHEME[emojiStyle].build.preapproval;
        case SdmGoalState.success:
            return EMOJI_SCHEME[emojiStyle].build.passed;
        case SdmGoalState.skipped:
            return EMOJI_SCHEME[emojiStyle].build.skipped;
        case SdmGoalState.canceled:
            return EMOJI_SCHEME[emojiStyle].build.canceled;
        case SdmGoalState.stopped:
            return EMOJI_SCHEME[emojiStyle].build.stopped;
        default:
            return EMOJI_SCHEME[emojiStyle].build.failed;
    }
}

function getStateLabel(state: SdmGoalState): string {
    let messageState;
    switch (state) {
        case "planned":
            messageState = "planned";
            break;
        case "in_process":
            messageState = "in process";
            break;
        case "requested":
            messageState = "requested";
            break;
        case "failure":
            messageState = "failed";
            break;
        case "stopped":
            messageState = "stopped";
            break;
        case "canceled":
            messageState = "canceled";
            break;
        case "waiting_for_pre_approval":
        case "pre_approved":
            messageState = "waiting to start";
            break;
        case "waiting_for_approval":
        case "approved":
            messageState = "requires approval";
            break;
        case "success":
            messageState = "succeeded";
    }
    return messageState;
}
