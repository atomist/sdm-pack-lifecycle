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
    buttonForCommand,
    menuForCommand,
} from "@atomist/automation-client";
import { slackWarningMessage } from "@atomist/sdm";
import {
    Action,
    Attachment,
    codeLine,
    italic,
    SlackMessage,
    url,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import * as pluralize from "pluralize";
import {
    AbstractIdentifiableContribution,
    RendererContext,
    SlackNodeRenderer,
} from "../../../../lifecycle/Lifecycle";
import { PushToPushLifecycle } from "../../../../typings/types";
import { isComplianceReview } from "./PushNodeRenderers";

export class ComplianceSummaryNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<PushToPushLifecycle.Push> {

    constructor() {
        super("compliance_summary");
    }

    public supports(node: PushToPushLifecycle.Push): boolean {
        return !!node.compliance && node.compliance.length > 0;
    }

    public async render(push: PushToPushLifecycle.Push,
                        actions: Action[],
                        msg: SlackMessage,
                        context: RendererContext): Promise<SlackMessage> {

        if (isComplianceReview(push)) {
            return Promise.resolve(msg);
        }

        const complianceData = push.compliance;
        const differencesCount = _.sum(complianceData.filter(c => !!c.differences).map(c => c.differences.length));
        if (differencesCount > 0) {
            const targetCount = _.sum(complianceData.filter(c => !!c.targets).map(c => c.targets.length));
            const compliance = ((1 - (differencesCount) / targetCount) * 100).toFixed(0);
            const attachment: Attachment = slackWarningMessage(
                `${differencesCount} Target ${pluralize("Difference")}`,
                undefined,
                context.context,
                {
                    actions: [
                        buttonForCommand(
                            { text: "Review \u02C3" },
                            "OpenComplianceReview",
                            { owner: push.repo.owner, repo: push.repo.name, branch: push.branch, sha: push.after.sha },
                        ),
                    ],
                }).attachments[0];
            attachment.footer = `compliance ${compliance}% \u00B7 ${url(`https://app.atomist.com/workspace/${context.context.workspaceId}/analysis`, `${pluralize("target", targetCount, true)} set`)}`;
            msg.attachments.push(attachment);
        }
        return msg;
    }
}

export class ComplianceNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<PushToPushLifecycle.Push> {

    constructor() {
        super("compliance");
    }

    public supports(node: PushToPushLifecycle.Push): boolean {
        return !!node.compliance && node.compliance.length > 0;
    }

    public async render(push: PushToPushLifecycle.Push,
                        actions: Action[],
                        message: SlackMessage,
                        context: RendererContext): Promise<SlackMessage> {

        if (!isComplianceReview(push)) {
            return Promise.resolve(message);
        }

        const complianceData = push.compliance;
        if (!!complianceData && complianceData.length > 0) {
            const differencesCount = _.sum(complianceData.filter(c => !!c.differences).map(c => c.differences.length));
            const msg = slackWarningMessage(
                `${differencesCount} Target ${pluralize("Difference")}`,
                `The following target differences were detected:`,
                context.context,
            );
            msg.attachments[0].footer = undefined;
            msg.attachments[0].ts = undefined;

            for (const compliance of complianceData) {
                const attachments = _.map(_.groupBy(compliance.differences, "type"), (_v, k) => {
                    const v = _.sortBy(_v, "displayName");
                    const targets = compliance.targets.filter(p => p.type === k);
                    const targetCount = targets.length;
                    const typeAttachments: Attachment[] = [];

                    typeAttachments.push({
                        title: targets[0].aspectName,
                        footer: `${targetCount} ${targetCount === 1 ? "target" : "targets"} set \u00B7 compliance ${((1 - (v.length / targetCount)) * 100).toFixed(0)}%`,
                        fallback: "",
                        color: "#20344A",
                    });

                    typeAttachments.push(...v.map(d => {
                        const target = compliance.targets.find(p => p.type === d.type && p.name === d.name);
                        return {
                            text: `${italic(d.displayName)} at ${codeLine(d.displayValue)} > ${codeLine(target.displayValue)}`,
                            fallback: "",
                        };
                    }));
                    if (v.length > 1) {
                        typeAttachments.slice(-1)[0].actions = [
                            menuForCommand({
                                text: "Apply Target",
                                options: v.map(d => ({
                                    text: d.displayName,
                                    value: JSON.stringify({ type: d.type, name: d.name, sha: d.sha, aspectOwner: compliance.owner }),
                                })),
                            }, "ApplyTarget", "data", {
                                owner: push.repo.owner,
                                repo: push.repo.name,
                                branch: push.branch,
                                apiUrl: push.repo.org.provider.apiUrl,
                            }),
                            menuForCommand({
                                text: "Set Target",
                                options: v.map(d => ({
                                    text: `${d.displayName} ${d.displayValue}`,
                                    value: JSON.stringify({ type: d.type, name: d.name, sha: d.sha, aspectOwner: compliance.owner }),
                                })),
                            }, "SetTarget", "data"),
                        ];
                    } else {
                        const diff = v[0];
                        typeAttachments.slice(-1)[0].actions = [
                            buttonForCommand({ text: "Apply Target" }, "ApplyTarget", {
                                owner: push.repo.owner,
                                repo: push.repo.name,
                                branch: push.branch,
                                apiUrl: push.repo.org.provider.apiUrl,
                                data: JSON.stringify({ type: diff.type, name: diff.name, sha: diff.sha, aspectOwner: compliance.owner }),
                            }),
                            buttonForCommand({ text: "Set Target" }, "SetTarget", {
                                data: JSON.stringify({ type: diff.type, name: diff.name, sha: diff.sha, aspectOwner: compliance.owner }),
                            }),
                        ];
                    }

                    return typeAttachments;
                });
                msg.attachments.push(..._.flatten(attachments));
                msg.attachments.push({
                    fallback: "",
                    footer: compliance.owner,
                    ts: Date.now(),
                    actions: [
                        ...(compliance.differences.length > 1 ? [buttonForCommand(
                            { text: "Apply All" },
                            "DiscardComplianceReview",
                            { owner: push.repo.owner, repo: push.repo.name, branch: push.branch, sha: push.after.sha })] : []),
                        buttonForCommand(
                            { text: "\u02C2 Back" },
                            "DiscardComplianceReview",
                            { owner: push.repo.owner, repo: push.repo.name, branch: push.branch, sha: push.after.sha }),
                    ],
                });
                message.attachments.push(...msg.attachments);
            }

        }
        return message;
    }
}
