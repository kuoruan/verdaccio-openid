import { Groups } from "@gitbeaker/node";
import { Issuer, Client, CallbackParamsType, generators } from "openid-client";

import logger from "@/logger";

import { AuthProvider } from "../plugin/AuthProvider";
import { ParsedPluginConfig } from "../plugin/Config";

import type { Request } from "express";

export class OpenIDConnectAuthProvider implements AuthProvider {
  private client?: Client;
  private readonly state: string;

  constructor(private readonly config: ParsedPluginConfig) {
    // not sure of a better way to do this:
    this.discoverClient();
    this.state = generators.state(32);
  }

  private get discoveredClient(): Client {
    if (!this.client) {
      throw new Error("Client has not yet been discovered");
    }

    return this.client;
  }

  private async discoverClient() {
    let issuer: Issuer;
    if (this.config.configurationEndpoint) {
      issuer = await Issuer.discover(this.config.configurationEndpoint);
    } else {
      if (!this.config.issuer) {
        throw new Error("Issuer must be specified");
      }
      issuer = new Issuer({
        issuer: this.config.issuer,
        authorization_endpoint: this.config.authorizationEndpoint,
        token_endpoint: this.config.tokenEndpoint,
        userinfo_endpoint: this.config.userinfoEndpoint,
        jwks_uri: this.config.jwksUri,
      });
    }

    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      response_types: ["code"],
    });
  }

  getId(): string {
    return "oidc";
  }

  getLoginUrl(callbackUrl: string): string {
    let scope: string;

    if (this.config.scope) {
      scope = this.config.scope;
    } else {
      scope = "openid email";

      if (this.config.groupsClaim) {
        scope += " groups";
      }
    }

    return this.discoveredClient.authorizationUrl({
      scope: scope,
      redirect_uri: callbackUrl,
      state: this.state,
    });
  }

  getCode(req: Request): string {
    return JSON.stringify(this.discoveredClient.callbackParams(req.url));
  }

  async getToken(code: string, callbackUrl?: string): Promise<string> {
    const params = JSON.parse(code) as CallbackParamsType;
    const checks = {
      state: this.state,
    };
    const tokenSet = await this.discoveredClient.callback(callbackUrl, params, checks);

    if (tokenSet.access_token !== undefined) {
      return tokenSet.access_token;
    }

    throw new Error("No access_token received in getToken callback");
  }

  async getUsername(token: string): Promise<string> {
    const userinfo = await this.discoveredClient.userinfo(token);
    const username = userinfo[this.config.usernameClaim] as string | undefined;

    if (username !== undefined) {
      return username;
    }

    throw new Error(`Could not grab username using the ${this.config.usernameClaim} property`);
  }

  async getGroups(token: string): Promise<string[]> {
    const userinfo = await this.discoveredClient.userinfo(token);

    if (this.config.groupsClaim) {
      const groups = userinfo[this.config.groupsClaim] as string[] | undefined;

      if (!groups) {
        throw new Error(`Could not grab groups using the ${this.config.groupsClaim} property`);
      }
      return groups;
    }

    const username = userinfo[this.config.usernameClaim];

    if (this.config.providerType) {
      switch (this.config.providerType) {
        case "gitlab": {
          const gitlabGroups = await this.getGitlabGroups(token);
          logger.info({ username, gitlabGroups }, "GitLab user @{username} has groups: @{gitlabGroups}");
          return gitlabGroups;
        }
        default: {
          throw new Error("unexpected provider type");
        }
      }
    }

    let groupUsers;
    if ((groupUsers = this.config.groupUsers) && username) {
      return Object.keys(groupUsers).filter((group) => {
        return groupUsers[group].includes(username);
      });
    }

    return [];
  }

  async getGitlabGroups(token: string): Promise<string[]> {
    const group = new Groups({
      host: this.config.issuer,
      oauthToken: token,
    });

    const userGroups = await group.all();
    return userGroups.map((g) => g.name);
  }
}
