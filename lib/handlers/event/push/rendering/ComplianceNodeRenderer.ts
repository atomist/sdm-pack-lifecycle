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
    buttonForCommand,
    menuForCommand,
} from "@atomist/automation-client/lib/spi/message/MessageClient";
import {
    slackInfoMessage,
    slackTs,
} from "@atomist/sdm/lib/api-helper/misc/slack/messages";
import {
    Action,
    Attachment,
    codeBlock,
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
import {
    LastCommitOnBranch,
    PolicyCompliaceState,
    PolicyComplianceFingerprint,
    PushToPushLifecycle,
    SourceFingerprint,
} from "../../../../typings/types";

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
        const aspectDifferenceCount = _.uniq(_.flatten(complianceData.filter(c => !!c.differences).map(c => c.differences)).map(c => c.type)).length;
        const differencesCount = _.sum(complianceData.filter(c => !!c.differences).map(c => c.differences.length));
        const targetCount = _.sum(complianceData.filter(c => !!c.targets).map(c => c.targets.length));
        const diffs = fingerprintDifferences(push);
        if (differencesCount > 0) {
            const compliance = ((1 - (differencesCount) / targetCount) * 100).toFixed(0);
            const delta = calculateComplianceDelta(push, compliance);
            const attachment: Attachment = slackInfoMessage(
                `${aspectDifferenceCount} ${pluralize("Aspect", aspectDifferenceCount)} with drift`,
                undefined,
                {
                    actions: [
                        buttonForCommand(
                            { text: "Review \u02C3" },
                            "OpenComplianceReview",
                            { id: push.id },
                        ),
                    ],
                }).attachments[0];
            attachment.footer = `${url(`https://app.atomist.com/workspace/${context.context.workspaceId}/analysis/manage`,
                `${pluralize("target", targetCount, true)} set`)} \u00B7 ${pluralize("violation", differencesCount, true)} \u00B7 compliance ${compliance}% ${delta}`;
            msg.attachments.push(attachment);

        } else if (diffs.changes.length > 0 || diffs.removals.length > 0 || diffs.additions.length > 0) {
            const aspectChangeCount = _.uniq([
                ...diffs.changes.map(v => v.to.type),
                ...diffs.additions.map(v => v.type),
                ...diffs.removals.map(v => v.type)]).length;
            const changeCount = diffs.changes.length;
            const additionCount = diffs.additions.length;
            const removalCount = diffs.removals.length;

            const attachment = slackInfoMessage(
                `${pluralize("Aspect", aspectChangeCount, true)} changed`,
                undefined, {
                    actions: [
                        buttonForCommand(
                            { text: "Review \u02C3" },
                            "OpenComplianceReview",
                            { id: push.id },
                        ),
                    ],
                }).attachments[0];

            const footer = [];
            if (changeCount > 0) {
                footer.push(pluralize("change", changeCount, true));
            }
            if (additionCount > 0) {
                footer.push(pluralize("addition", additionCount, true));
            }
            if (removalCount > 0) {
                footer.push(pluralize("removal", removalCount, true));
            }
            attachment.footer = footer.join(" \u00B7 ");

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
            const lastCommit = await context.context.graphClient.query<LastCommitOnBranch.Query, LastCommitOnBranch.Variables>({
                name: "lastCommitOnBranch",
                variables: {
                    owner: push.repo.owner,
                    name: push.repo.name,
                    branch: push.branch,
                },
            });
            const isTipOfBranch = (_.get(lastCommit, "Repo[0].branches[0].commit.sha") || push.after.sha) === push.after.sha;

            const aspectDifferenceCount = _.uniq(_.flatten(complianceData.filter(c => !!c.differences).map(c => c.differences)).map(c => c.type)).length;

            if (aspectDifferenceCount > 0) {

                const msg = slackInfoMessage(
                    `${aspectDifferenceCount} ${pluralize("Aspect", aspectDifferenceCount)} with drift`,
                    `The following ${pluralize("aspect", aspectDifferenceCount)} ${aspectDifferenceCount === 1 ? "is" : "are"} different from workspace targets:`,
                );
                msg.attachments[0].footer = undefined;
                msg.attachments[0].ts = undefined;

                for (const compliance of complianceData) {
                    const attachments = _.map(_.groupBy(compliance.differences, "type"), (diffs, k) => {
                        const v = _.sortBy(diffs, "displayName");
                        const allTargets = compliance.targets.filter(p => p.type === k);
                        const targetCount = allTargets.length;
                        const typeAttachments: Attachment[] = [];
                        const c = ((1 - (v.length / targetCount)) * 100).toFixed(0);
                        const delta = calculateComplianceDelta(push, c, allTargets[0].type);
                        typeAttachments.push({
                            title: allTargets[0].displayType,
                            footer: `${url(`https://app.atomist.com/workspace/${context.context.workspaceId}/analysis/manage?types=${encodeURIComponent(allTargets[0].type)}`,
                                `${targetCount} ${pluralize("target", targetCount)} set`)} \u00B7 ${pluralize("violation", v.length, true)} \u00B7 compliance ${c}% ${delta}`,
                            fallback: allTargets[0].displayType,
                            color: "#20344A",
                        });

                        const targets: PolicyComplianceFingerprint[] = [];
                        const lines = v.map(d => {
                            const target = compliance.targets.find(p => p.type === d.type && p.name === d.name);
                            targets.push(target);
                            return `${italic(d.displayName)} ${renderDisplayValue(d)} \u00B7 target ${renderDisplayValue(target)}`;
                        });

                        typeAttachments.push({
                            text: lines.join("\n"),
                            fallback: "Target violations",
                        });

                        if (v.length > 1) {
                            typeAttachments.slice(-1)[0].actions = [
                                ...(isTipOfBranch ? [menuForCommand({
                                    text: "Accept Target",
                                    options: targets.map(d => ({
                                        text: `${d.displayName} ${d.displayValue}`,
                                        value: JSON.stringify({ type: d.type, name: d.name, sha: d.sha, aspectOwner: compliance.owner }),
                                    })),
                                }, "ApplyTarget", "data", {
                                    owner: push.repo.owner,
                                    repo: push.repo.name,
                                    branch: push.branch,
                                    apiUrl: push.repo.org.provider.apiUrl,
                                })] : []),
                                menuForCommand({
                                    text: "Set as Target",
                                    options: v.map(d => ({
                                        text: `${d.displayName} ${d.displayValue}`,
                                        value: JSON.stringify({ ...d, aspectOwner: compliance.owner }),
                                    })),
                                }, "SetTarget", "data"),
                            ];
                        } else {
                            const fp = v[0];
                            const target = targets[0];
                            typeAttachments.slice(-1)[0].actions = [
                                ...(isTipOfBranch ? [buttonForCommand({ text: "Accept Target" }, "ApplyTarget", {
                                    owner: push.repo.owner,
                                    repo: push.repo.name,
                                    branch: push.branch,
                                    apiUrl: push.repo.org.provider.apiUrl,
                                    data: JSON.stringify({
                                        type: target.type,
                                        name: target.name,
                                        sha: target.sha,
                                        aspectOwner: compliance.owner,
                                    }),
                                })] : []),
                                buttonForCommand({ text: "Set as Target" }, "SetTarget", {
                                    data: JSON.stringify({ ...fp, aspectOwner: compliance.owner }),
                                }),
                            ];
                        }

                        return typeAttachments;
                    });
                    msg.attachments.push(..._.flatten(attachments));
                    msg.attachments.push({
                        fallback: "Apply Targets",
                        footer: compliance.owner,
                        ts: slackTs(),
                        actions: [
                            ...(isTipOfBranch && compliance.differences.length > 1 ? [buttonForCommand(
                                { text: "Accept All" },
                                "ApplyAllTargets",
                                {
                                    id: push.id,
                                    owner: push.repo.owner,
                                    repo: push.repo.name,
                                    branch: push.branch,
                                    sha: push.after.sha,
                                    apiUrl: push.repo.org.provider.apiUrl,
                                    data: JSON.stringify({
                                        fingerprints: compliance.differences.map(d => `${d.type}::${d.name}`).join(","),
                                        aspectOwner: compliance.owner,
                                    }),
                                })] : []),
                        ],
                    });
                    message.attachments.push(...msg.attachments);
                }
            }

            // Render fingerprint differences for this push
            if (!!push.before && !!push.before.analysis && push.before.analysis.length > 0) {
                const diffs = fingerprintDifferences(push);
                const types = _.uniqBy([
                    ...diffs.changes.map(v => ({ type: v.to.type, displayType: v.to.displayType })),
                    ...diffs.additions.map(v => ({ type: v.type, displayType: v.displayType })),
                    ...diffs.removals.map(v => ({ type: v.type, displayType: v.displayType }))], "type");
                const changeCount = types.length;

                if (changeCount > 0) {

                    const diffAttachment = slackInfoMessage(
                        `${pluralize("Aspect", changeCount, true)} changed`,
                        `The following ${pluralize("aspect", changeCount)} ${changeCount !== 1 ? "have" : "has"} changed with this push:`).attachments[0];
                    diffAttachment.footer = undefined;
                    diffAttachment.ts = undefined;

                    message.attachments.push(diffAttachment);

                    const changesByType = _.groupBy(diffs.changes, v => v.to.type);
                    const additionsByType = _.groupBy(diffs.additions, "type");
                    const removalsByType = _.groupBy(diffs.removals, "type");

                    for (const type of types) {
                        const changes = _.sortBy(changesByType[type.type] || [], v => v.to.displayName);
                        const additions = _.sortBy(additionsByType[type.type] || [], "displayName");
                        const removals = _.sortBy(removalsByType[type.type] || [], "displayName");

                        if (!_.isEmpty(changes) || !_.isEmpty(additions) || !_.isEmpty(removals)) {
                            const newTargets = _.sortBy([...changes.map(c => c.to), ...additions], "displayName");
                            message.attachments.push({
                                title: type.displayType,
                                fallback: type.displayType,
                                color: "#20344A",
                            });

                            const lines = [];

                            changes.forEach(d => {
                                lines.push(`${codeLine("-")} ${italic(d.to.displayName)} ${renderDisplayValue(d.from)}`);
                                lines.push(`${codeLine("+")} ${italic(d.to.displayName)} ${renderDisplayValue(d.to)}`);
                            });
                            lines.push(...additions.map(d => `${codeLine("+")} ${italic(d.displayName)} ${renderDisplayValue(d)}`));
                            lines.push(...removals.map(d => `${codeLine("-")} ${italic(d.displayName)} ${renderDisplayValue(d)}`));

                            message.attachments.push({
                                text: lines.join("\n"),
                                fallback: lines.join("\n"),
                                actions: _.uniqBy(newTargets, "displayName").length === 1 ?
                                    [
                                        ...(isManageable(push, newTargets[0].type) ? [buttonForCommand({ text: "Set as Target" }, "SetTarget", {
                                            data: JSON.stringify({
                                                ...newTargets[0],
                                                aspectOwner: getAspectOwner(push, newTargets[0].type),
                                            }),
                                        })] : []),
                                    ] : [
                                        menuForCommand({
                                            text: "Set as Target",
                                            options: newTargets.filter(t => isManageable(push, t.type)).map(d => ({
                                                text: `${d.displayName} ${d.displayValue}`,
                                                value: JSON.stringify({
                                                    ...d,
                                                    aspectOwner: getAspectOwner(push, d.type),
                                                }),
                                            })),
                                        }, "SetTarget", "data"),
                                    ],
                            });
                        }
                    }
                }
            }

            message.attachments.slice(-1)[0].actions = [
                ...(message.attachments.slice(-1)[0].actions || []),
                buttonForCommand(
                    { text: "\u02C2 Close" },
                    "DiscardComplianceReview",
                    { id: push.id }),
            ];
        }

        return message;
    }
}

export function fingerprintDifferences(push: PushToPushLifecycle.Push): { changes: Array<{ from: SourceFingerprint, to: SourceFingerprint }>, additions: SourceFingerprint[], removals: SourceFingerprint[] } {
    if (!!push.before && !!push.before.analysis && push.before.analysis.length > 0) {
        const changes: Array<{ from: any, to: any }> = [];
        const additions: any[] = [];
        const removals: any[] = [];

        _.sortBy(push.after.analysis, "type", "name").forEach(a => {
            const p = push.before.analysis.find(ba => ba.name === a.name && ba.type === a.type);
            if (!p) {
                additions.push(a);
            } else if (p.sha !== a.sha && p.displayValue !== a.displayValue) {
                changes.push({ to: a, from: p });
            }
        });

        _.sortBy(push.before.analysis, "type", "name").forEach(a => {
            const p = push.after.analysis.find(ba => ba.name === a.name && ba.type === a.type);
            if (!p) {
                removals.push(a);
            }
        });

        return {
            changes,
            additions,
            removals,
        };
    }

    // If there are no fingerprints on the before, assume no differences
    return { additions: [], changes: [], removals: [] };
}

export function isComplianceReview(push: PushToPushLifecycle.Push): boolean {
    if (!!push && !!push.compliance && push.compliance.length > 0) {
        return push.compliance.some(c => c.state === PolicyCompliaceState.in_review);
    }
    return false;
}

function getAspectOwner(push: PushToPushLifecycle.Push, type: string): string | undefined {
    if (!!push && !!push.compliance) {
        const compliance = push.compliance.find(c => (c.aspects || []).some(a => a.type === type));
        if (!!compliance) {
            return compliance.owner;
        }
    }
    return undefined;
}

function isManageable(push: PushToPushLifecycle.Push, type: string): boolean {
    if (!!push && !!push.compliance) {
        const aspect = _.flatten(push.compliance.map(c => c.aspects)).find(a => a.type === type);
        if (!!aspect) {
            return !!aspect.manageable;
        }
    }
    return false;
}

function renderDisplayValue(fp: { displayValue?: string }): string {
    if (!!fp.displayValue) {
        const lines = fp.displayValue.split("\n");
        if (lines.length > 1) {
            return `\n${codeBlock(fp.displayValue)}`;
        }
    }
    return codeLine(fp.displayValue);
}

function calculateComplianceDelta(push: PushToPushLifecycle.Push, compliance: string, type?: string): string {
    if (!!push.compliance && !!push.before && !!push.before.analysis) {
        const allTargets = _.flatten(push.compliance.map(c => c.targets)).filter(t => !type || type === t.type);
        const relevantTargets = allTargets.filter(t => push.before.analysis.some(a => a.type === t.type && a.name && t.name));
        const diffs = push.before.analysis.filter(a => allTargets.some(t => t.type === a.type && t.name === a.name && t.sha !== a.sha));
        let beforeCompliance = "100";
        if (relevantTargets.length > 0) {
            beforeCompliance = ((1 - (diffs.length) / relevantTargets.length) * 100).toFixed(0);
        }
        const delta = +compliance - +beforeCompliance;
        if (delta < 0) {
            return `\u00B7 ${delta}%`;
        } else if (delta === 0) {
            return "\u00B7 ±0%";
        } else {
            return `\u00B7 +${delta}%`;
        }
    }
    return "";
}
