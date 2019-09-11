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
            const attachment: Attachment = {
                author_name: `${differencesCount} target ${pluralize("difference")} detected`,
                author_icon: `https://images.atomist.com/rug/info.png`,
                color: "B5B5B5",
                footer: `compliance ${compliance}% \u00B7 ${url(`https://app.atomist.com/workspace/${context.context.workspaceId}/analysis`, `${pluralize("target", targetCount, true)} set`)}`,
                fallback: "Target differences detected",
                actions: [
                    buttonForCommand(
                        { text: "Review \u02C3" },
                        "OpenComplianceReview",
                        { owner: push.repo.owner, repo: push.repo.name, branch: push.branch, sha: push.after.sha },
                    ),
                ],
            };
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

            const msg = slackWarningMessage(
                "Target Differences",
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
                                    value: `${d.type}::${d.name}::${d.sha}`,
                                })),
                            }, "ApplyFingerprint", "fingerprint", {}),
                            menuForCommand({
                                text: "Set Target",
                                options: v.map(d => ({
                                    text: d.displayName,
                                    value: `${d.type}::${d.name}::${d.sha}`,
                                })),
                            }, "SetTarget", "fingerprint", {}),
                        ];
                    } else {
                        typeAttachments.slice(-1)[0].actions = [
                            buttonForCommand({ text: "Apply Target" }, "ApplyFingerprint", {}),
                            buttonForCommand({ text: "Set Target" }, "SetTarget", {}),
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
