import { logger } from "~/libs/modules/logger/logger.js";
import { sectionStatusService } from "~/modules/section-statuses/section-statuses.js";

import { ActivityController } from "./activity.controller.js";
import { ActivityModel } from "./activity.model.js";
import { ActivityRepository } from "./activity.repository.js";
import { ActivityService } from "./activity.service.js";

const activityRepository = new ActivityRepository(ActivityModel);
const activityService = new ActivityService({ activityRepository });
const activityController = new ActivityController(
	logger,
	activityService,
	sectionStatusService,
);

export { activityController };
export { ActivityEntity } from "./activity.entity.js";
export { type ActivityService } from "./activity.service.js";
export { ActivityType } from "./libs/enums/enums.js";