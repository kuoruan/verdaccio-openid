import { authenticatedUserGroups } from "@/constants";
import logger from "@/logger";

import { ParsedPluginConfig } from "./Config";
import { UserWithToken, Verdaccio } from "./Verdaccio";

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

  createAuthenticatedUser(username: string, groups: string[]): RemoteUser {
    const relevantGroups = groups.filter((group) => group in this.configuredGroups);

    relevantGroups.push(username);

    if (this.requiredGroup) {
      relevantGroups.push(this.requiredGroup);
    }

    // get unique and sorted groups
    const realGroups = relevantGroups.filter((val, index, self) => self.indexOf(val) === index).sort();

    const user: RemoteUser = {
      name: username,
      groups: [...authenticatedUserGroups, ...realGroups],
      real_groups: realGroups,
    };
    logger.info({ user }, "Created authenticated user @{user}");

    return user;
  }

  async createUiCallbackUrl(username: string, providerToken: string, groups: string[]): Promise<string> {
    this.checkVerdaccioInitialized();

    const user = this.createAuthenticatedUser(username, groups);

    const uiToken = await this.verdaccio!.issueUiToken(user, providerToken);
    const npmToken = await this.verdaccio!.issueNpmToken(user, providerToken);

    const query = { username, uiToken, npmToken };
    return `/?${new URLSearchParams(query).toString()}`;
  }

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

  verifyUiToken(uiToken: string): UserWithToken {
    this.checkVerdaccioInitialized();

    return this.verdaccio!.verifyUiToken(uiToken);
  }

  verifyNpmToken(npmToken: string): UserWithToken {
    this.checkVerdaccioInitialized();

    return this.verdaccio!.verifyNpmToken(npmToken);
  }
}
