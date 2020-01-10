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

import { configurationValue } from "@atomist/automation-client/lib/configuration";
import { EventFired } from "@atomist/automation-client/lib/HandleEvent";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import { addressSlackChannels } from "@atomist/automation-client/lib/spi/message/MessageClient";
import { logger } from "@atomist/automation-client/lib/util/logger";
import { PreferenceStoreFactory } from "@atomist/sdm/lib/api/context/preferenceStore";
import { SlackMessage } from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    CardMessage,
    newCardMessage,
} from "../../../lifecycle/card";
import {
    Channel,
    Lifecycle,
    LifecycleHandler,
    Preferences,
} from "../../../lifecycle/Lifecycle";
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import {
    PushToPushLifecycle,
    SdmGoalFields,
    SdmGoalState,
} from "../../../typings/types";
import { subscribePreferenceKey } from "../../command/sdm/SubscribeToGoalSets";
import { LifecyclePreferences } from "../preferences";
import { sortTagsByName } from "./rendering/PushNodeRenderers";

export class PushCardLifecycleHandler<R> extends LifecycleHandler<R> {

    constructor(private readonly extractNodes: (event: EventFired<R>) => PushToPushLifecycle.Push[],
                private readonly contributors: Contributions) {
        super();
    }

    protected async prepareMessage(lifecycle: Lifecycle, ctx: HandlerContext): Promise<CardMessage> {
        const msg = newCardMessage("push");
        const repo = lifecycle.extract("repo");
        msg.repository = {
            owner: repo.owner,
            name: repo.name,
            slug: `${repo.owner}/${repo.name}`,
        };
        msg.ts = +lifecycle.timestamp;

        return Promise.resolve(msg);
    }

    protected async prepareLifecycle(event: EventFired<R>, ctx: HandlerContext): Promise<Lifecycle[]> {
        const pushes = this.extractNodes(event);

        return pushes.filter(p => p && p.after).map(push => {
            const nodes: any[] = orderNodes(push);

            // Verify that there is at least a push and repo node
            if (!nodes) {
                logger.debug(`Lifecycle event is missing push, commits and/or repo node`);
                return null;
            }

            const configuration: Lifecycle = {
                name: LifecyclePreferences.push.id,
                nodes,
                renderers: _.flatten((this.contributors.renderers || []).map(r => r(push))),
                contributors: _.flatten((this.contributors.actions || []).map(a => a(push))),
                id: `push_lifecycle/${push.repo.owner}/${push.repo.name}/${push.branch}/${push.after.sha}`,
                timestamp: Date.now().toString(),
                channels: [{
                    name: "atomist:dashboard",
                    teamId: ctx.workspaceId,
                }],
                extract: (type: string) => {
                    if (type === "repo") {
                        return push.repo;
                    } else if (type === "push") {
                        return push;
                    } else if (type === "domains") {
                        return extractDomains(push).sort((d1, d2) => d1.name.localeCompare(d2.name));
                    } else if (type === "events") {
                        return null;
                    } else if (type === "goalSets") {
                        return (push.goalSets || []).sort((g1, g2) => g2.ts - g1.ts)
                            .filter(gs => !(gs.tags || []).some(t => t.name === "@atomist/sdm/internal"));
                    }
                    return null;
                },
            };
            return configuration;
        });
    }

    protected extractPreferences(event: EventFired<R>): { [teamId: string]: Preferences[] } {
        return {};
    }
}

export class PushLifecycleHandler<R> extends LifecycleHandler<R> {

    constructor(private readonly extractNodes: (event: EventFired<R>) => PushToPushLifecycle.Push[],
                private readonly ep: (event: EventFired<R>) => { [teamId: string]: Preferences[] },
                private readonly contributors: Contributions,
                private readonly id: string = LifecyclePreferences.push.id) {
        super();
    }

    protected async prepareMessage(lifecycle: Lifecycle, ctx: HandlerContext): Promise<SlackMessage> {
        return Promise.resolve({
            text: null,
            attachments: [],
        });
    }

    protected async prepareLifecycle(event: EventFired<R>, ctx: HandlerContext): Promise<Lifecycle[]> {
        const pushes = this.extractNodes(event);
        const preferences = this.extractPreferences(event);

        const lifecycles: Lifecycle[] = [];
        for (const push of  pushes.filter(p => p && p.after)) {
            const channels = this.filterChannels(push, preferences);

            const logins: string[] = [];
            logins.push(_.get(push, "after.author.login"));
            logins.push(_.get(push, "after.committer.login"));

            push.commits.forEach(c => {
                logins.push(_.get(c, "author.login"));
                logins.push(_.get(c, "committer.login"));
            });

            for (const login of _.uniq(logins)) {
                const subscriptions = await configurationValue<PreferenceStoreFactory>("sdm.preferenceStoreFactory")(ctx)
                    .get<Channel[]>(subscribePreferenceKey(login), { defaultValue: [] });
                channels.push(...subscriptions);
            }

            const nodes: any[] = orderNodes(push);

            // Verify that there is at least a push and repo node
            if (!nodes) {
                logger.debug(`Lifecycle event is missing push, commits and/or repo node`);
                return null;
            }

            const mostCurrentGoal = _.maxBy(push.goals || [], "ts");

            // Delete old messages if there are more goal sets now
            const ids = createId(push);
            if (!!ids.toDelete) {
                for (const id of ids.toDelete) {
                    for (const channel of channels) {
                        await ctx.messageClient.delete(addressSlackChannels(channel.teamId, channel.name), { id });
                    }
                }
            }

            const configuration: Lifecycle = {
                name: this.id,
                nodes,
                renderers: _.flatten((this.contributors.renderers || []).map(r => r(push))),
                contributors: _.flatten((this.contributors.actions || []).map(a => a(push))),
                id: ids.id,
                timestamp: mostCurrentGoal ? mostCurrentGoal.ts.toString() : Date.now().toString(),
                channels,
                extract: (type: string) => {
                    if (type === "repo") {
                        return push.repo;
                    } else if (type === "push") {
                        return push;
                    } else if (type === "domains") {
                        return extractDomains(push).sort((d1, d2) => d1.name.localeCompare(d2.name));
                    } else if (type === "goalSets") {
                        return (push.goalSets || []).sort((g1, g2) => g2.ts - g1.ts)
                            .filter(gs => !(gs.tags || []).some(t => t.name === "@atomist/sdm/internal"));
                    }
                    return null;
                },
            };
            lifecycles.push(configuration);
        }
        return lifecycles;
    }

    private filterChannels(push: graphql.PushToPushLifecycle.Push,
                           preferences: { [teamId: string]: Preferences[] } = {})
        : Channel[] {
        const channels = (_.get(push, "repo.channels") || [])
            .filter((c: any) => c.name && c.name.length >= 1);
        if (!channels || channels.length === 0) {
            return [];
        }

        const channelNames: Channel[] = [];

        const repo = push.repo.name;
        const owner = push.repo.owner;
        const branch = push.branch;

        push.repo.channels.forEach(channel => {
            if (preferences[channel.team.id]) {
                const branchConfiguration =
                    preferences[channel.team.id].find(p => p.name === "lifecycle_branches");
                if (branchConfiguration) {
                    try {
                        const configuration = JSON.parse(branchConfiguration.value);
                        // Find the first match from the start of the configuration
                        const channelConfiguration = configuration.find((c: any) => matches(c.name, channel.name));
                        if (channelConfiguration) {
                            // Now find the first matching repository configuration
                            const repoConfiguration = channelConfiguration.repositories
                                .find((r: any) => matches(r.owner, owner) && matches(r.name, repo));
                            if (repoConfiguration) {
                                const include = repoConfiguration.include ?
                                    matches(repoConfiguration.include, branch) : null;
                                const exclude = repoConfiguration.exclude ?
                                    matches(repoConfiguration.exclude, branch) : null;
                                if (include === true && exclude !== false) {
                                    channelNames.push({ name: channel.name, teamId: channel.team.id });
                                } else if (include === null && exclude !== true) {
                                    channelNames.push({ name: channel.name, teamId: channel.team.id });
                                }
                            }
                        } else {
                            channelNames.push({ name: channel.name, teamId: channel.team.id });
                        }
                    } catch (err) {
                        logger.warn(
                            `Team preferences 'lifecycle_branches' are corrupt: '${branchConfiguration.value}'`);
                    }
                } else {
                    channelNames.push({ name: channel.name, teamId: channel.team.id });
                }
            } else {
                channelNames.push({ name: channel.name, teamId: channel.team.id });
            }
        });

        return channelNames;
    }

    protected extractPreferences(event: EventFired<R>): { [teamId: string]: Preferences[] } {
        return this.ep(event);
    }

}

function orderNodes(push: graphql.PushToPushLifecycle.Push): any[] {
    // Verify that there is at least a push and repo node
    if (!push || !push.repo || !push.commits) {
        logger.debug(`Lifecycle event is missing push and/or repo node`);
        return null;
    }

    const repo = push.repo;
    const nodes: any[] = [];
    if (!!repo) {
        nodes.push(repo);
    }

    // Push lifecycle starts with, drum roll, a Push
    if (!!push) {
        nodes.push(push);
        // Add all Tag nodes
        if (!!push.after && !!push.after.tags) {
            sortTagsByName(push.after.tags)
                .forEach((t: any) => nodes.push(t));
        }
    }

    // Add Build nodes
    if (!!push.builds && push.builds.length > 0) {
        // Sort the builds in descending order; newest first
        push.builds.sort((b1, b2) => b2.timestamp.localeCompare(b1.timestamp))
            .forEach(b => nodes.push(b));

        // Add Workflow nodes
        _.uniqBy(push.builds.filter(b => b.workflow),
            b => b.workflow.id).forEach(b => nodes.push(b.workflow));
    }

    // Add Domain -> App nodes
    const domains = extractDomains(push).sort((d1, d2) => d1.name.localeCompare(d2.name));
    domains.forEach(d => nodes.push(d));

    // Add Goals nodes
    const goalSets: GoalSet[] = [];
    _.forEach(_.groupBy(push.goals, "goalSetId"),
        (v, k) => {
            const gs = (push.goalSets || []).find(g => g.goalSetId === k);
            goalSets.push({
                goals: v,
                goalSetId: k,
                ts: !!gs ? gs.ts : _.min(v.map(g => g.ts)),
                tags: (!!gs ? gs.tags as any[] : undefined) || [],
            });
        });

    nodes.push(...goalSets.filter(gs => !(gs.tags || []).some(t => t.name === "@atomist/sdm/internal"))
        .sort((g1, g2) => g2.ts - g1.ts));

    return nodes;
}

function extractDomains(push: graphql.PushToPushLifecycle.Push): Domain[] {
    const domains: any = {};
    push.commits.filter(c => c.apps).forEach(c => c.apps.forEach(a => {
        const domain = a.domain;
        if (domains[domain]) {
            domains[domain].push(a);
        } else {
            domains[domain] = [a];
        }
    }));

    const result: Domain[] = [];
    for (const domain in domains) {
        if (domains.hasOwnProperty(domain)) {
            result.push({ name: domain, apps: domains[domain] });
        }
    }

    return result;
}

function matches(pattern: string, target: string): boolean {
    const regexp = new RegExp(pattern, "g");
    const match = regexp.exec(target);
    return !!match && match.length > 0;
}

function createId(push: graphql.PushToPushLifecycle.Push): { id: string, toDelete?: string[] } {
    const id = `push_lifecycle/${push.repo.owner}/${push.repo.name}/${push.branch}/${push.after.sha}`;
    if (!!push.goalSets) {
        const goalSets = push.goalSets.filter(gs => !(gs.tags || []).some(t => t.name === "@atomist/sdm/internal"));
        if (goalSets.length > 1) {
            const toDelete = [id];
            for (let i = 1, len = goalSets.length; i < len; i++) {
                toDelete.push(`${id}/${i}`);
            }
            return { id: `${id}/${goalSets.length}`, toDelete };
        } else if (goalSets.length === 1 && goalSets[0].provenance.name !== "SetGoalsOnPush") {
            return { id: `${id}/${goalSets.length}`, toDelete: [id] };
        }
    }
    return { id };
}

export interface Domain {
    name: string;
    apps: graphql.PushFields.Apps[];
}

export interface GoalSet {
    goalSetId: string;
    goals: SdmGoalFields.Fragment[];
    ts: number;
    tags: Array<{ name: string, value: string }>;
}
