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

import { subscription } from "@atomist/automation-client/lib/graph/graphQL";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import { Success } from "@atomist/automation-client/lib/HandlerResult";
import { addressEvent } from "@atomist/automation-client/lib/spi/message/MessageClient";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import { IssueRelationshipOnCommit } from "../../../typings/types";
import { extractLinkedIssues } from "../../../util/helpers";

export function issueRelationshipOnCommit(): EventHandlerRegistration<IssueRelationshipOnCommit.Subscription> {
    return {
        name: "IssueRelationshipOnCommit",
        description: "Create a relationship between a commit and issue/PR",
        tags: ["lifecylce", "issue"],
        subscription: subscription("issueRelationshipOnCommit"),
        listener: async (e, ctx) => {
            const commit = e.data.Commit[0];

            const issues = await extractLinkedIssues(commit.message, commit.repo, [], ctx);

            if (issues) {
                for (const issue of issues.issues) {
                    await storeCommitIssueRelationship(commit, issue, ctx);
                }
                for (const pr of issues.prs) {
                    await storeCommitIssueRelationship(commit, pr, ctx);
                }
            }

            return Success;
        },
    };
}

async function storeCommitIssueRelationship(commit: any, issue: any, ctx: HandlerContext): Promise<void> {
    const referencedIssue = {
        commit: {
            owner: commit.repo.owner,
            repo: commit.repo.name,
            sha: commit.sha,
        },
        issue: {
            name: issue.name,
            owner: issue.repo.owner,
            repo: issue.repo.name,
        },
        type: "references",
    };
    await ctx.messageClient.send(referencedIssue, addressEvent("CommitIssueRelationship"));
}
