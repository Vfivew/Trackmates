import fastifyStatic from "@fastify/static";
import swagger, { type StaticDocumentSpec } from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError, type RouteOptions } from "fastify";
import fastifyCors from "fastify-cors";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_FILE_SIZE_IN_MB } from "~/libs/constants/constants.js";
import { ContentType, ServerErrorType } from "~/libs/enums/enums.js";
import { type ValidationError } from "~/libs/exceptions/exceptions.js";
import { getSizeInBytes } from "~/libs/helpers/helpers.js";
import { type Config } from "~/libs/modules/config/config.js";
import { type Database } from "~/libs/modules/database/database.js";
import { HTTPCode, HTTPError } from "~/libs/modules/http/http.js";
import { type Logger } from "~/libs/modules/logger/logger.js";
import { type SocketService } from "~/libs/modules/socket/socket.js";
import { type Token, type TokenPayload } from "~/libs/modules/token/token.js";
import { authorization, fileUpload } from "~/libs/plugins/plugins.js";
import {
	type ServerCommonErrorResponse,
	type ServerValidationErrorResponse,
	type ValidationSchema,
} from "~/libs/types/types.js";
import { subscriptionService } from "~/modules/subscriptions/subscriptions.js";
import { type UserService } from "~/modules/users/users.js";

import { WHITE_ROUTES } from "./libs/constants/constants.js";
import {
	type ServerApplication,
	type ServerApplicationApi,
	type ServerApplicationRouteParameters,
} from "./libs/types/types.js";

type Constructor = {
	apis: ServerApplicationApi[];
	config: Config;
	database: Database;
	logger: Logger;
	services: {
		socketService: SocketService;
		userService: UserService;
	};
	title: string;
	token: Token<TokenPayload>;
};

class BaseServerApplication implements ServerApplication {
	private apis: ServerApplicationApi[];

	private app: ReturnType<typeof Fastify>;

	private config: Config;

	private database: Database;

	private logger: Logger;

	private services: {
		socketService: SocketService;
		userService: UserService;
	};

	private title: string;

	private token: Token<TokenPayload>;

	public constructor({
		apis,
		config,
		database,
		logger,
		services,
		title,
		token,
	}: Constructor) {
		this.title = title;
		this.token = token;
		this.config = config;
		this.logger = logger;
		this.database = database;
		this.apis = apis;
		this.services = services;

		this.app = Fastify({
			ignoreTrailingSlash: true,
		});

		this.app.register(fastifyCors, {
			origin: "*",
			methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
		});
	}

	private initCrons(): void {
		subscriptionService.initCrone();
	}

	private initErrorHandler(): void {
		this.app.setErrorHandler(
			(error: FastifyError | ValidationError, _request, reply) => {
				if ("issues" in error) {
					this.logger.error(`[Validation Error]: ${error.message}`);

					for (let issue of error.issues) {
						this.logger.error(`[${issue.path.toString()}] — ${issue.message}`);
					}

					const response: ServerValidationErrorResponse = {
						details: error.issues.map((issue) => ({
							message: issue.message,
							path: issue.path,
						})),
						errorType: ServerErrorType.VALIDATION,
						message: error.message,
					};

					return reply.status(HTTPCode.UNPROCESSED_ENTITY).send(response);
				}

				if (error instanceof HTTPError) {
					this.logger.error(`[HTTP Error]: ${error.status} – ${error.message}`);

					const response: ServerCommonErrorResponse = {
						errorType: ServerErrorType.COMMON,
						message: error.message,
					};

					return reply.status(error.status).send(response);
				}

				this.logger.error(error.message);

				const response: ServerCommonErrorResponse = {
					errorType: ServerErrorType.COMMON,
					message: error.message,
				};

				return reply.status(HTTPCode.INTERNAL_SERVER_ERROR).send(response);
			},
		);
	}

	private async initPlugins(): Promise<void> {
		await this.app.register(authorization, {
			services: {
				userService: this.services.userService,
			},
			token: this.token,
			whiteRoutes: WHITE_ROUTES,
		});
		await this.app.register(fileUpload, {
			allowedExtensions: [ContentType.JPEG, ContentType.PNG],
			fileSize: getSizeInBytes(MAX_FILE_SIZE_IN_MB),
		});
	}

	private async initServe(): Promise<void> {
		const staticPath = join(
			dirname(fileURLToPath(import.meta.url)),
			"../../../../public",
		);

		await this.app.register(fastifyStatic, {
			prefix: "/",
			root: staticPath,
		});

		this.app.setNotFoundHandler(async (_request, response) => {
			await response.sendFile("index.html", staticPath);
		});
	}

	private initSocket(): void {
		const { socketService } = this.services;
		socketService.initialize(this.app.server);
	}

	private initValidationCompiler(): void {
		this.app.setValidatorCompiler<ValidationSchema>(({ schema }) => {
			return <T, R = ReturnType<ValidationSchema["parse"]>>(data: T): R => {
				return schema.parse(data) as R;
			};
		});
	}

	public addRoute(parameters: ServerApplicationRouteParameters): void {
		const { handler, method, path, preHandlers = [], validation } = parameters;
		const routeParameters: RouteOptions = {
			handler,
			method,
			schema: {
				body: validation?.body,
				params: validation?.params,
				querystring: validation?.query,
			},
			url: path,
		};

		routeParameters.preHandler = preHandlers;

		this.app.route(routeParameters);
		this.logger.info(`Route: ${method} ${path} is registered`);
	}

	public addRoutes(parameters: ServerApplicationRouteParameters[]): void {
		for (let parameter of parameters) {
			this.addRoute(parameter);
		}
	}

	public async init(): Promise<void> {
		this.logger.info("Application initialization…");

		await this.initServe();

		await this.initMiddlewares();

		this.initValidationCompiler();

		this.initErrorHandler();

		await this.initPlugins();

		this.initRoutes();

		this.initSocket();

		this.initCrons();

		this.database.connect();

		try {
			await this.app.listen({
				host: this.config.ENV.APP.HOST,
				port: this.config.ENV.APP.PORT,
			});

			this.logger.info(
				`Application is listening on PORT – ${this.config.ENV.APP.PORT.toString()}, on ENVIRONMENT – ${
					this.config.ENV.APP.ENVIRONMENT as string
				}.`,
			);
		} catch (error) {
			if (error instanceof Error) {
				this.logger.error(error.message, {
					cause: error.cause,
					stack: error.stack,
				});
			}

			throw error;
		}
	}

	public async initMiddlewares(): Promise<void> {
		await Promise.all(
			this.apis.map(async (api) => {
				this.logger.info(
					`Generate swagger documentation for API ${api.version}`,
				);

				await this.app.register(swagger, {
					mode: "static",
					specification: {
						document: api.generateDoc(
							this.title,
						) as StaticDocumentSpec["document"],
					},
				});

				await this.app.register(swaggerUi, {
					routePrefix: `${api.version}/documentation`,
				});
			}),
		);
	}

	public initRoutes(): void {
		const routers = this.apis.flatMap((api) => api.routes);

		this.addRoutes(routers);
	}
}

export { BaseServerApplication };
