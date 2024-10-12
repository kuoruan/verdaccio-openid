import logger from "./logger";

export function respondWithCliMessage(status: string, message: string) {
  switch (status) {
    case "success": {
      logger.success("All done! We've updated your npm configuration.");
      break;
    }

    case "denied": {
      logger.error("You are not a member of the required access group.");
      break;
    }

    default: {
      logger.warn(message);
      break;
    }
  }
}
