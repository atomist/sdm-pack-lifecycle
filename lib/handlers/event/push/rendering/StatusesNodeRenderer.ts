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

import { logger } from "@atomist/automation-client/lib/util/logger";
import { formatDuration } from "@atomist/sdm/lib/core/util/misc/time";
import {
    Action,
    Attachment,
    codeLine,
    italic,
    SlackMessage,
    url,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    Action as CardAction,
    CardMessage,
    Goal,
} from "../../../../lifecycle/card";
import {
    AbstractIdentifiableContribution,
    CardNodeRenderer,
    LifecycleConfiguration,
    RendererContext,
    SlackNodeRenderer,
} from "../../../../lifecycle/Lifecycle";
import {
    CheckRunConclusion,
    CheckRunStatus,
    PushToPushLifecycle,
    SdmGoalDisplayFormat,
    SdmGoalDisplayState,
    SdmGoalsByCommit,
    SdmGoalState,
    StatusState,
} from "../../../../typings/types";
import {
    lastGoalSet,
    sortGoals,
} from "../../../../util/goals";
import { LifecycleRendererPreferences } from "../../preferences";
import { GoalSet } from "../PushLifecycle";
import { EMOJI_SCHEME } from "./PushNodeRenderers";

export interface Check {
    id: number;
    name: string;
    description: string;
    state: Omit<StatusState, "failure">;
    conclusion: CheckRunConclusion;
    url: string;
    detailsUrl: string;
}

export class StatusesNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<PushToPushLifecycle.Push> {

    public showOnPush: boolean;
    public emojiStyle: "default" | "atomist";
    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super("statuses");
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.showOnPush = configuration.configuration["show-statuses-on-push"] || true;
        this.emojiStyle = configuration.configuration["emoji-style"] || "default";
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: PushToPushLifecycle.Push): boolean {
        if (node.after) {
            return this.showOnPush && (node.after?.statuses?.length > 0 || node.after?.checkSuites?.length > 0);
        } else {
            return false;
        }
    }

    public async render(push: PushToPushLifecycle.Push,
                        actions: Action[],
                        msg: SlackMessage,
                        context: RendererContext): Promise<SlackMessage> {

        const shouldChannelExpand = context.lifecycle.renderers.some(
            r => r.id() === LifecycleRendererPreferences.push.expand.id) === true ? SdmGoalDisplayFormat.full : undefined;
        let displayFormat = shouldChannelExpand || _.get(push, "goalsDisplayState[0].format");
        if (this.renderingStyle === SdmGoalDisplayFormat.full) {
            displayFormat = SdmGoalDisplayFormat.full;
        } else if (!displayFormat) {
            displayFormat = this.renderingStyle;
        }

        // List all the statuses on the after commit
        const commit = push.after;
        const checks = aggregateStatusesAndChecks(commit).filter(check => notAlreadyDisplayed(push, check));
        if (checks.length === 0) {
            return msg;
        }

        const pending = checks.filter(s => s.state === StatusState.pending).length;
        const success = checks.filter(s => s.state === StatusState.success).length;
        const error = checks.length - pending - success;

        // Now each one
        const lines = checks.filter(c => {
            if (displayFormat === SdmGoalDisplayFormat.compact) {
                if (c.state === StatusState.pending || c.state === StatusState.failure || c.state === StatusState.error) {
                    return true;
                } else {
                    context.set("show_more", true);
                    return false;
                }
            }
            return true;
        }).map(s => {
                if (s.detailsUrl?.length > 0 && s.description?.length > 0) {
                    return `${this.emoji(s.conclusion)} ${url(s.detailsUrl, s.description)} \u00B7 ${s.url?.length > 0 ? url(s.url, s.name) : s.name}`;
                } else if (s.description?.length > 0) {
                    return `${this.emoji(s.conclusion)} ${s.description} \u00B7 ${s.url?.length > 0 ? url(s.url, s.name) : s.name}`;
                } else {
                    return `${this.emoji(s.conclusion)} ${s.url?.length > 0 ? url(s.url, s.name) : s.name}`;
                }
            });

        const color =
            pending > 0 ? "#2A7D7D" :
                error > 0 ? "#BC3D33" :
                    "#37A745";

        const summary = url(checks[0].url, summarizeStatusCounts(pending, success, error));

        if (lines.length > 0) {
            const attachment: Attachment = {
                // author_name: lines.length > 1 ? "Checks" : "Check",
                // author_icon: `https://images.atomist.com/rug/status.png?random=${guid()}`,
                color,
                fallback: summary,
                actions,
                text: lines.join("\n"),
                footer: summary,
            };
            msg.attachments.push(attachment);

            if (!push.goals || push.goals.length === 0) {
                let present = 0;
                if (context.has("attachment_count")) {
                    present = context.get("attachment_count");
                }
                context.set("attachment_count", present + 1);
            }
        } else {
            // Add the check summary to the commit footer for better readability
            const lastAttachment = msg.attachments[msg.attachments.length - 1];
            if (!!lastAttachment.footer) {
                lastAttachment.footer = `${lastAttachment.footer} \u00B7 ${summary}`;
            } else {
                lastAttachment.footer = summary;
            }
        }

        return msg;
    }

    private emoji(state: CheckRunConclusion): string {
        switch (state) {
            case CheckRunConclusion.action_required:
                return EMOJI_SCHEME[this.emojiStyle].build.action_required;
            case CheckRunConclusion.timed_out:
                return EMOJI_SCHEME[this.emojiStyle].build.failed;
            case CheckRunConclusion.stale:
                return EMOJI_SCHEME[this.emojiStyle].build.requested;
            case CheckRunConclusion.neutral:
                return EMOJI_SCHEME[this.emojiStyle].build.skipped;
            case CheckRunConclusion.failure:
                return EMOJI_SCHEME[this.emojiStyle].build.failed;
            case CheckRunConclusion.cancelled:
            case CheckRunConclusion.skipped:
                return EMOJI_SCHEME[this.emojiStyle].build.canceled;
            case CheckRunConclusion.success:
                return EMOJI_SCHEME[this.emojiStyle].build.passed;
            default:
                return EMOJI_SCHEME[this.emojiStyle].build.started;
        }
    }
}

export class StatusesCardNodeRenderer extends AbstractIdentifiableContribution
    implements CardNodeRenderer<PushToPushLifecycle.Push> {

    constructor() {
        super("statuses");
    }

    public supports(node: any): boolean {
        if (node.after) {
            return node.after.statuses && node.after.statuses.length > 0;
        } else {
            return false;
        }
    }

    public render(push: PushToPushLifecycle.Push,
                  actions: CardAction[],
                  msg: CardMessage,
                  context: RendererContext): Promise<CardMessage> {

        // List all the statuses on the after commit
        const commit = push.after;
        // exclude build statuses already displayed
        const statuses = commit.statuses;
        if (statuses.length === 0) {
            return Promise.resolve(msg);
        }

        const success = statuses.filter(s => s.state === "success").length;

        // Now each one
        const body = statuses.sort((s1, s2) => s1.context.localeCompare(s2.context)).map(s => {

            let icon;
            if (s.state === "success") {
                icon = "css://icon-status-check";
            } else if (s.state === "pending") {
                icon = "css://icon-status-check alert";
            } else {
                icon = "css://icon-status-check fail";
            }

            let text;
            if (!!s.targetUrl && s.targetUrl.length > 0) {
                text = `${s.description} \u00B7 ${url(s.targetUrl, s.context)}`;
            } else {
                text = `${s.description} \u00B7 ${s.context}`;
            }

            return {
                icon,
                text,
            };
        });

        msg.correlations.push({
            type: "status",
            icon: "css://icon-status-check",
            shortTitle: `${success}/${statuses.length}`,
            title: `${statuses.length} Check`,
            body,
        });

        return Promise.resolve(msg);
    }
}

export class GoalSetNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<GoalSet> {

    public emojiStyle: "default" | "atomist";
    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super("goals");
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.emojiStyle = configuration.configuration["emoji-style"] || "default";
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        if (node.goals && node.goalSetId) {
            return true;
        } else {
            return false;
        }
    }

    public async render(goalSet: GoalSet,
                        actions: Action[],
                        msg: SlackMessage,
                        context: RendererContext): Promise<SlackMessage> {

        const push = context.lifecycle.extract("push") as PushToPushLifecycle.Push;

        let sortedGoals = [];
        const goalSets = context.lifecycle.extract("goalSets") as GoalSet[];
        const goalSetIndex = goalSets.findIndex(gs => gs.goalSetId === goalSet.goalSetId);
        const displayState = _.get(push, "goalsDisplayState[0].state") || SdmGoalDisplayState.show_current;

        const shouldChannelExpand = context.lifecycle.renderers.some(
            r => r.id() === LifecycleRendererPreferences.push.expand.id) === true ? SdmGoalDisplayFormat.full : undefined;
        let displayFormat = shouldChannelExpand || _.get(push, "goalsDisplayState[0].format");
        if (this.renderingStyle === SdmGoalDisplayFormat.full) {
            displayFormat = SdmGoalDisplayFormat.full;
        } else if (!displayFormat) {
            displayFormat = this.renderingStyle;
        }

        if (displayState === SdmGoalDisplayState.show_current && goalSetIndex !== 0) {
            return Promise.resolve(msg);
        }

        try {
            sortedGoals.push(...sortGoals((goalSet ? goalSet.goals : []) || [], goalSets));
        } catch (err) {
            logger.warn(`Goal sorting failed with error: '%s'`, err.message);
        }

        if (displayFormat === SdmGoalDisplayFormat.compact) {
            sortedGoals = [{ goals: _.flatten(sortedGoals.map(sg => sg.goals)) }];
        }

        const attachments: Attachment[] = [];
        sortedGoals.filter(sg => sg.goals && sg.goals.length > 0).forEach((sg, ix) => {
            const statuses = sg.goals;
            const color = this.color(statuses);

            const nonPlanned = statuses.some(
                s => s.state !== "planned" && s.state !== "skipped" && s.state !== "canceled");

            // Now each one
            const lines = statuses.filter(s => {
                if (displayFormat === SdmGoalDisplayFormat.full) {
                    return true;
                } else {
                    const np = statuses.some(g => g.state !== SdmGoalState.planned);
                    if (s.state === SdmGoalState.planned && np) {
                        return false;
                    }
                    return ![SdmGoalState.success,
                        SdmGoalState.skipped,
                        SdmGoalState.canceled].includes(s.state);
                }
            }).map(s => {
                let details = "";
                if ((s.state === SdmGoalState.in_process || s.state === SdmGoalState.failure ||
                    s.state === SdmGoalState.stopped || s.state === SdmGoalState.canceled) && s.phase) {
                    details += ` \u00B7 ${s.phase}`;
                } else {
                    if (s.externalUrl) {
                        details += ` \u00B7 ${url(s.externalUrl, "Link")}`;
                    }
                    if (s.externalUrls) {
                        details += s.externalUrls.map(eu => ` \u00B7 ${url(eu.url, eu.label || "Link")}`).join("");
                    }
                }
                if (s.preApproval && s.preApproval.userId) {
                    if (s.state === SdmGoalState.pre_approved) {
                        details += ` \u00B7 start requested by @${s.preApproval.userId}`;
                    } else {
                        details += ` \u00B7 started by @${s.preApproval.userId}`;
                    }
                }
                if (s.approval && s.approval.userId) {
                    if (s.state === SdmGoalState.approved) {
                        details += ` \u00B7 approval requested by @${s.approval.userId}`;
                    } else {
                        details += ` \u00B7 approved by @${s.approval.userId}`;
                    }
                }

                if (displayFormat === SdmGoalDisplayFormat.full &&
                    ![SdmGoalState.planned,
                        SdmGoalState.requested,
                        SdmGoalState.skipped,
                        SdmGoalState.pre_approved,
                        SdmGoalState.waiting_for_pre_approval].includes(s.state)) {
                    const start = (s.provenance.find(p => p.name === "RequestDownstreamGoalsOnGoalSuccess") || _.minBy(s.provenance, "ts")).ts;
                    const end = (s.provenance.find(p => p.name === "FulfillGoalOnRequested") || s).ts;
                    if (end - start > 0) {
                        details += ` \u00B7 ${formatDuration(end - start, "d[d] h[h] m[m] s[s]")}`;
                    }
                }

                if (!!s.url && s.url.length > 0) {
                    return `${this.emoji(s.state)} ${url(s.url, s.description)}${details}`;
                } else {
                    return `${this.emoji(s.state)} ${s.description}${details}`;
                }
            });

            if (lines.length === 0 && displayFormat === SdmGoalDisplayFormat.compact) {
                const lastGoals = lastGoalSet(goalSet.goals);
                const gsid = lastGoals[0].goalSetId;
                let gs = lastGoals[0].goalSet;
                if (gs.length > 40) {
                    gs = gs.slice(0, 40) + "...";
                }
                const link =
                    `https://app.atomist.com/workspace/${context.context.workspaceId}/goalset/${gsid}`;
                let state: SdmGoalState;
                let label: string;
                if (lastGoals.some(g => g.state === SdmGoalState.failure)) {
                    state = SdmGoalState.failure;
                    label = "failed";
                } else if (lastGoals.some(g => g.state === SdmGoalState.waiting_for_approval)) {
                    state = SdmGoalState.waiting_for_approval;
                    label = "is waiting for approval";
                } else if (lastGoals.some(g => g.state === SdmGoalState.approved)) {
                    state = SdmGoalState.approved;
                    label = "is approved";
                } else if (lastGoals.some(g => g.state === SdmGoalState.waiting_for_pre_approval)) {
                    state = SdmGoalState.waiting_for_pre_approval;
                    label = "is waiting to be started";
                } else if (lastGoals.some(g => g.state === SdmGoalState.pre_approved)) {
                    state = SdmGoalState.pre_approved;
                    label = "is started";
                } else if (lastGoals.some(g => g.state === SdmGoalState.stopped)) {
                    state = SdmGoalState.stopped;
                    label = "is stopped";
                } else if (lastGoals.some(g => g.state === SdmGoalState.canceled)) {
                    state = SdmGoalState.canceled;
                    label = "is canceled";
                } else if (lastGoals.some(g => g.state === SdmGoalState.in_process)) {
                    state = SdmGoalState.in_process;
                    label = "is in process";
                } else if (lastGoals.some(g => g.state === SdmGoalState.requested)) {
                    state = SdmGoalState.requested;
                    label = "is requested";
                } else if (lastGoals.some(g => g.state === SdmGoalState.planned)) {
                    state = SdmGoalState.planned;
                    label = "is being planned";
                } else if (lastGoals.some(g => g.state === SdmGoalState.success)) {
                    state = SdmGoalState.success;
                    label = "completed";
                }
                lines.push(
                    `${this.emoji(state)} ${url(link, `Goal set ${italic(gs.toLowerCase())} ${
                        codeLine(gsid.slice(0, 7))} ${label}`)}`);
            }

            if (ix === 0 || nonPlanned) {
                const attachment: Attachment = {
                    author_name: ix === 0 && displayFormat === SdmGoalDisplayFormat.full ?
                        (lines.length > 1 ? "Goals" : "Goal") : undefined,
                    author_icon: ix === 0 && displayFormat === SdmGoalDisplayFormat.full ?
                        "https://images.atomist.com/rug/goals.png" : undefined,
                    color,
                    fallback: `${sg.goals[0].goalSet} Goals`,
                    text: lines.join("\n"),
                };
                attachments.push(attachment);
            }
        });

        if (attachments.length > 0) {
            const attachment = attachments.slice(-1)[0];
            attachment.actions = actions;

            const lastGoals = lastGoalSet(goalSet.goals);
            const gsid = lastGoals[0].goalSetId;
            const ts = lastGoals.map(g => g.ts);
            const min = _.get((push.goalSets || []).find(gs => gs.goalSetId === gsid), "ts", 0);
            const max = _.max(ts);
            const dur = max - min;

            const duration = formatDuration(dur < 0 ? 0 : dur, "d[d] h[h] m[m] s[s]");

            const creator = _.minBy(
                _.flatten<SdmGoalsByCommit.Provenance>(
                    lastGoals.map(g => (g.provenance || []))), "ts");

            attachment.ts = Math.floor(max / 1000);
            const link =
                `https://app.atomist.com/workspace/${context.context.workspaceId}/goalset/${gsid}`;

            if (displayFormat === SdmGoalDisplayFormat.full) {
                if (creator) {
                    attachment.footer =
                        `${creator.registration}:${creator.version} \u00B7 ${lastGoals[0].goalSet.toLowerCase()} \u00B7 ${
                            url(link, gsid.slice(0, 7))} \u00B7 ${duration}`;
                } else {
                    attachment.footer = `${url(link, gsid.slice(0, 7))} \u00B7 ${duration}`;
                }
            } else {
                const inProcessCount = lastGoals.filter(
                    s => s.state === SdmGoalState.success ||
                        s.state === SdmGoalState.approved || s.state === SdmGoalState.stopped).length;
                const totalCount = lastGoals.length;
                let state;
                if (lastGoals.some(g => g.state === SdmGoalState.failure)) {
                    state = SdmGoalState.failure;
                } else if (lastGoals.some(g => g.state === SdmGoalState.in_process)) {
                    state = SdmGoalState.in_process;
                } else if (lastGoals.some(g => g.state === SdmGoalState.requested)) {
                    state = SdmGoalState.requested;
                } else if (lastGoals.some(g => g.state === SdmGoalState.waiting_for_approval)) {
                    state = SdmGoalState.waiting_for_approval;
                } else if (lastGoals.some(g => g.state === SdmGoalState.approved)) {
                    state = SdmGoalState.approved;
                } else if (lastGoals.some(g => g.state === SdmGoalState.waiting_for_pre_approval)) {
                    state = SdmGoalState.waiting_for_pre_approval;
                } else if (lastGoals.some(g => g.state === SdmGoalState.pre_approved)) {
                    state = SdmGoalState.pre_approved;
                } else if (lastGoals.some(g => g.state === SdmGoalState.stopped)) {
                    state = SdmGoalState.stopped;
                } else if (lastGoals.some(g => g.state === SdmGoalState.canceled)) {
                    state = SdmGoalState.canceled;
                } else if (lastGoals.some(g => g.state === SdmGoalState.planned)) {
                    state = SdmGoalState.planned;
                } else if (lastGoals.some(g => g.state === SdmGoalState.success)) {
                    state = SdmGoalState.success;
                }

                attachment.footer_icon = "https://images.atomist.com/rug/goals.png";
                attachment.footer = `${url(link, lastGoals[0].goalSet.toLowerCase())} \u00B7 ${duration}`;
                if (this.emojiStyle === "atomist") {
                    attachment.thumb_url =
                        `https://badge.atomist.com/v2/progress/${state}/${inProcessCount}/${totalCount}`;
                }
            }
        }

        let present = 0;
        if (context.has("attachment_count")) {
            present = context.get("attachment_count");
        }
        context.set("attachment_count", present + attachments.length);

        msg.attachments.push(...attachments);

        return Promise.resolve(msg);
    }

    private color(goals: SdmGoalsByCommit.SdmGoal[]): string {
        let color;
        if (goals.some(g => g.state === SdmGoalState.failure)) {
            color = "#BC3D33";
        } else if (goals.some(g => g.state === SdmGoalState.in_process)) {
            color = "#2A7D7D";
        } else if (goals.some(g => g.state === SdmGoalState.requested)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.waiting_for_approval)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.approved)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.waiting_for_pre_approval)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.pre_approved)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.stopped)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.canceled)) {
            color = "#B5B5B5";
        } else if (goals.some(g => g.state === SdmGoalState.planned)) {
            color = "#D7B958";
        } else if (goals.some(g => g.state === SdmGoalState.success)) {
            color = "#37A745";
        }
        return color;
    }

    private emoji(state: string): string {
        switch (state) {
            case SdmGoalState.planned:
            case SdmGoalState.requested:
                return EMOJI_SCHEME[this.emojiStyle].build.requested;
            case SdmGoalState.in_process:
                return EMOJI_SCHEME[this.emojiStyle].build.started;
            case SdmGoalState.approved:
            case SdmGoalState.waiting_for_approval:
                return EMOJI_SCHEME[this.emojiStyle].build.approval;
            case SdmGoalState.pre_approved:
            case SdmGoalState.waiting_for_pre_approval:
                return EMOJI_SCHEME[this.emojiStyle].build.preapproval;
            case SdmGoalState.success:
                return EMOJI_SCHEME[this.emojiStyle].build.passed;
            case SdmGoalState.skipped:
                return EMOJI_SCHEME[this.emojiStyle].build.skipped;
            case SdmGoalState.canceled:
                return EMOJI_SCHEME[this.emojiStyle].build.canceled;
            case SdmGoalState.stopped:
                return EMOJI_SCHEME[this.emojiStyle].build.stopped;
            default:
                return EMOJI_SCHEME[this.emojiStyle].build.failed;
        }
    }
}

export class GoalCardNodeRenderer extends AbstractIdentifiableContribution
    implements CardNodeRenderer<GoalSet> {

    constructor() {
        super("goals");
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async render(goalSet: GoalSet,
                        actions: CardAction[],
                        msg: CardMessage,
                        context: RendererContext): Promise<CardMessage> {
        const sortedGoals = [];
        const goalSets = context.lifecycle.extract("goalSets");

        try {
            sortedGoals.push(...sortGoals((goalSet ? goalSet.goals : []) || [], goalSets));
        } catch (err) {
            logger.warn(`Goal sorting failed with error: '%s'`, err.message);
        }

        let total = 0;
        const gs: Goal[] = [];
        sortedGoals.filter(sg => sg.goals && sg.goals.length > 0).forEach(sg => {
            total += sg.goals.length;

            // Now each one
            sg.goals.forEach(s => {
                let details = "";
                if ((s.state === SdmGoalState.in_process || s.state === SdmGoalState.failure ||
                    s.state === SdmGoalState.stopped) && s.phase) {
                    details += ` \u00B7 ${s.phase}`;
                } else {
                    if (s.externalUrl) {
                        details += ` \u00B7 ${url(s.externalUrl, "Link")}`;
                    }
                    if (s.externalUrls) {
                        details += s.externalUrls.map(eu => ` \u00B7 ${url(eu.url, eu.label || "Link")}`).join("");
                    }
                }
                if (s.preApproval && s.preApproval.userId) {
                    if (s.state === SdmGoalState.pre_approved) {
                        details += ` \u00B7 start requested by @${s.preApproval.userId}`;
                    } else {
                        details += ` \u00B7 started by @${s.preApproval.userId}`;
                    }
                }
                if (s.approval && s.approval.userId) {
                    if (s.state === SdmGoalState.approved) {
                        details += ` \u00B7 approval requested by @${s.approval.userId}`;
                    } else {
                        details += ` \u00B7 approved by @${s.approval.userId}`;
                    }
                }
                gs.push({
                    name: s.name,
                    description: `${s.description}${details}`,
                    state: s.state as any,
                    environment: sg.environment,
                    ts: s.ts,
                    link: s.url,
                });
            });
        });

        if (total > 0) {
            const lastGoals = lastGoalSet(goalSet.goals);
            const ts = lastGoals.map(g => g.ts);
            const gsid = lastGoals[0].goalSetId;
            const push = context.lifecycle.extract("push") as PushToPushLifecycle.Push;
            const min = _.get((push.goalSets || []).find(gss => gss.goalSetId === gsid), "ts", 0);
            const max = _.max(ts);
            const dur = max - min;

            const creator = _.minBy(
                _.flatten<SdmGoalsByCommit.Provenance>(lastGoals.map(g => (g.provenance || []))), "ts");

            let state: SdmGoalState;
            if (lastGoals.some(g => g.state === SdmGoalState.failure)) {
                state = SdmGoalState.failure;
            } else if (lastGoals.some(g => g.state === SdmGoalState.waiting_for_approval)) {
                state = SdmGoalState.waiting_for_approval;
            } else if (lastGoals.some(g => g.state === SdmGoalState.approved)) {
                state = SdmGoalState.approved;
            } else if (lastGoals.some(g => g.state === SdmGoalState.waiting_for_pre_approval)) {
                state = SdmGoalState.waiting_for_pre_approval;
            } else if (lastGoals.some(g => g.state === SdmGoalState.pre_approved)) {
                state = SdmGoalState.pre_approved;
            } else if (lastGoals.some(g => g.state === SdmGoalState.stopped)) {
                state = SdmGoalState.stopped;
            } else if (lastGoals.some(g => g.state === SdmGoalState.canceled)) {
                state = SdmGoalState.canceled;
            } else if (lastGoals.some(g => g.state === SdmGoalState.in_process)) {
                state = SdmGoalState.in_process;
            } else if (lastGoals.some(g => g.state === SdmGoalState.requested)) {
                state = SdmGoalState.requested;
            } else if (lastGoals.some(g => g.state === SdmGoalState.planned)) {
                state = SdmGoalState.planned;
            } else if (lastGoals.some(g => g.state === SdmGoalState.success)) {
                state = SdmGoalState.success;
            }

            msg.goalSets.push({
                goalSet: lastGoals[0].goalSet,
                goalSetId: lastGoals[0].goalSetId,
                ts: Date.now(),
                duration: dur < 0 ? 0 : dur,
                actions,
                goals: gs,
                registration: creator ? `${creator.registration}:${creator.version}` : undefined,
                state,
            });
        }

        return Promise.resolve(msg);
    }
}

enum ConclusionOrder {
    action_required = 0,
    timed_out = 1,
    failure = 2,
    cancelled = 3,
    // in progress = 4,
    neutral = 5,
    skipped = 6,
    success = 7,
}

export function aggregateStatusesAndChecks(commit: PushToPushLifecycle.Push["after"]): Check[] {
    const allChecks: Array<Check & { order: number }> = [];

    // First statuses
    commit.statuses?.forEach(s => {
        let state;
        let conclusion;
        switch (s.state) {
            case StatusState.success:
                state = StatusState.success;
                conclusion = CheckRunConclusion.success;
                break;
            case StatusState.error:
                state = StatusState.error;
                conclusion = CheckRunConclusion.action_required;
                break;
            case StatusState.failure:
                state = StatusState.error;
                conclusion = CheckRunConclusion.failure;
                break;
            case StatusState.pending:
                state = StatusState.pending;
                break;
        }

        allChecks.push({
            id: -1,
            name: s.context,
            description: s.description,
            url: s.targetUrl,
            state,
            conclusion,
            detailsUrl: undefined,
            order: conclusion ? +ConclusionOrder[conclusion as any] : 4,
        });
    });
    // Second checks
    commit.checkSuites?.forEach(c => {
        const app = c.appSlug;
        c.checkRuns?.forEach(r => {
            let state;
            switch (r.status) {
                case CheckRunStatus.in_progress:
                case CheckRunStatus.queued:
                    state = StatusState.pending;
                    break;
                case CheckRunStatus.completed:
                    switch (r.conclusion) {
                        case CheckRunConclusion.action_required:
                        case CheckRunConclusion.cancelled:
                        case CheckRunConclusion.stale:
                        case CheckRunConclusion.failure:
                        case CheckRunConclusion.timed_out:
                            state = StatusState.error;
                            break;
                        case CheckRunConclusion.neutral:
                        case CheckRunConclusion.skipped:
                        case CheckRunConclusion.success:
                            state = StatusState.success;
                            break;
                    }
                    break;
            }
            const name = `${app}/${r.name}`;
            const highestId = _.maxBy(allChecks.filter(ac => ac.name === name), "id")?.id || -1;
            if (highestId < +r.checkRunId) {
                allChecks.push({
                    id: +r.checkRunId,
                    name,
                    description: r.outputTitle,
                    url: r.htmlUrl,
                    state,
                    conclusion: r.conclusion,
                    detailsUrl: r.detailsUrl,
                    order: r.conclusion ? +ConclusionOrder[r.conclusion as any] : 4,
                });
            }
        });
    });
    return _.orderBy(allChecks, ["order", "name"], ["asc", "asc"]);
}

function notAlreadyDisplayed(push: any, status: Check): boolean {
    if (status.name.includes("travis-ci") && !!push.builds &&
        push.builds.some((b: any) => b.provider === "travis")) {
        return false;
    }
    if (status.name.includes("circleci") && !!push.builds &&
        push.builds.some((b: any) => b.provider === "circle")) {
        return false;
    }
    if (status.name.includes("jenkins") && !!push.builds &&
        push.builds.some((b: any) => b.provider === "jenkins")) {
        return false;
    }
    if (status.name.includes("codeship") && !!push.builds &&
        push.builds.some((b: any) => b.provider.includes("codeship"))) {
        return false;
    }
    if (status.name.includes("sdm/")) {
        return false;
    }
    return true;
}

export function summarizeStatusCounts(pending: number,
                                      success: number,
                                      error: number,
                                      labelSingular: string = "check",
                                      labelPlural: string = "checks"): string {

    const parts = [];
    let check = "check";
    if (pending > 0) {
        parts.push(`${pending} pending`);
        if (pending > 1) {
            check = labelPlural;
        }
    }
    if (error > 0) {
        parts.push(`${error} failing`);
        if (error > 1) {
            check = labelPlural;
        } else {
            check = labelSingular;
        }
    }
    if (success > 0) {
        parts.push(`${success} successful`);
        if (success > 1) {
            check = labelPlural;
        } else {
            check = labelSingular;
        }
    }

    // Now each one
    let footerMessage = "";
    let i;
    for (i = 0; i < parts.length; ++i) {
        if (i === 0) {
            footerMessage += parts[i];
        } else if (i === parts.length - 1) {
            footerMessage += " and " + parts[i];
        } else {
            footerMessage += ", " + parts[i];
        }
    }

    return `${footerMessage} ${check}`;
}
