import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import type { AppConfig } from "./config.js";

/** Tạo ứng dụng (dùng chung cho main.ts và test e2e). */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    logger: config.NODE_ENV === "test" ? false : ["log", "warn", "error"],
  });
  app.setGlobalPrefix("api/v1");
  app.set("trust proxy", /^\d+$/.test(config.TRUST_PROXY) ? Number(config.TRUST_PROXY) : config.TRUST_PROXY);
  app.disable("x-powered-by");
  // Nén JSON (danh sách người, hồ sơ…). Phả đồ / lịch giỗ đã nén sẵn trong bộ nhớ đệm nên được bỏ qua.
  app.use(compression({ threshold: 1024 }));
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "1mb" });
  app.enableShutdownHooks();
  return app;
}
