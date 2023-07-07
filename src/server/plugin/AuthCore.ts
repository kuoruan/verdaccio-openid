import { defaultLoggedUserRoles } from "@verdaccio/config";

import { stringifyQueryParams } from "@/query-params";

import { ParsedPluginConfig } from "./Config";
import { UserWithToken, Verdaccio } from "./Verdaccio";
import logger from "../logger";

import type { RemoteUser } from "@verdaccio/types";

export class AuthCore {
  private readonly configuredGroups: Record<string, true>;

  private verdaccio?: Verdaccio;

  constructor(private readonly config: ParsedPluginConfig) {
    this.configuredGroups = this.getConfiguredGroups();
  }

  public setVerdaccio(verdaccio: Verdaccio) {
    this.verdaccio = verdaccio;
  }

  private checkVerdaccioInitialized() {
    if (!this.verdaccio) {
      throw new Error("Verdaccio is not initialized");
    }
  }

  /**
   * Returns all permission groups used in the Verdacio config.
   */
  getConfiguredGroups() {
    const configuredGroups: Record<string, true> = {};
    Object.values(this.config.packages || {}).forEach((packageConfig) => {
      ["access", "publish", "unpublish"]
        .flatMap((key) => packageConfig[key])
        .filter(Boolean)
        .forEach((group: string) => {
          configuredGroups[group] = true;
        });
    });
    return configuredGroups;
  }

  private get requiredGroup(): string | null {
    return this.config.authorizedGroup ? this.config.authorizedGroup : null;
  }

  /**
   * Get the user groups from the config
   *
   * @param username
   * @returns groups or undefined
   */
  getUserGroups(username: string): string[] | undefined {
    let groupUsers;
    if ((groupUsers = this.config.groupUsers)) {
      return Object.keys(groupUsers).filter((group) => {
        return groupUsers[group].includes(username);
      });
    }
  }

  createAuthenticatedUser(username: string, groups: string[]): RemoteUser {
    const relevantGroups = groups.filter((group) => group in this.configuredGroups);

    relevantGroups.push(username);

    // put required group at the end
    if (this.requiredGroup) {
      relevantGroups.push(this.requiredGroup);
    }

    // get unique and sorted groups
    const realGroups = relevantGroups.filter((val, index, self) => self.indexOf(val) === index).sort();

    const user: RemoteUser = {
      name: username,
      groups: [...defaultLoggedUserRoles, ...realGroups],
      real_groups: realGroups,
    };
    logger.info({ user: JSON.stringify(user) }, "created authenticated user: @{user}");

    return user;
  }

  async createUiCallbackUrl(username: string, providerToken: string, groups: string[]): Promise<string> {
    this.checkVerdaccioInitialized();

    const user = this.createAuthenticatedUser(username, groups);

    const uiToken = await this.verdaccio!.issueUiToken(user, providerToken);
    const npmToken = await this.verdaccio!.issueNpmToken(user, providerToken);

    const query = { username, uiToken, npmToken };
    return `/?${stringifyQueryParams(query)}`;
  }

  /**
   * Check if the user is allowed to access the registry
   *
   * @param username
   * @param groups
   * @returns true if the user is allowed to access the registry
   */
  authenticate(username: string, groups: string[] = []): boolean {
    if (this.requiredGroup) {
      if (username !== this.requiredGroup && !groups.includes(this.requiredGroup)) {
        logger.error(
          { username, requiredGroup: this.requiredGroup },
          `Access denied: User "@{username}" is not a member of "@{requiredGroup}"`
        );
        return false;
      }
    }

    // empty group is allowed
    return true;
  }

  issueNpmToken(user: RemoteUser, providerToken: string): Promise<string> {
    this.checkVerdaccioInitialized();

    return this.verdaccio!.issueNpmToken(user, providerToken);
  }

  issueUiToken(user: RemoteUser, providerToken: string): Promise<string> {
    this.checkVerdaccioInitialized();

    return this.verdaccio!.issueUiToken(user, providerToken);
  }

  verifyUiToken(uiToken: string): UserWithToken {
    this.checkVerdaccioInitialized();

    return this.verdaccio!.verifyUiToken(uiToken);
  }

  verifyNpmToken(npmToken: string): UserWithToken {
    this.checkVerdaccioInitialized();

    return this.verdaccio!.verifyNpmToken(npmToken);
  }
}
