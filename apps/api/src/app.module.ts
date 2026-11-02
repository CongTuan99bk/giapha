import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthController, MeController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { ClansController } from "./clans/clans.controller.js";
import { ClansService } from "./clans/clans.service.js";
import { ErrorFilter } from "./common/errors.js";
import { SessionGuard, TenantGuard } from "./common/guards.js";
import { APP_CONFIG, type AppConfig } from "./config.js";
import { Database } from "./db/database.js";
import { HealthController } from "./health.controller.js";
import { InstanceController } from "./instance.controller.js";
import { InvitationsController, MembersController } from "./members/members.controller.js";
import { MembersService } from "./members/members.service.js";
import { MediaController } from "./media/media.controller.js";
import { MediaService } from "./media/media.service.js";
import { MediaStorage } from "./media/media-storage.js";
import { SiteService } from "./site/site.service.js";
import { PersonsController } from "./persons/persons.controller.js";
import { PersonsService } from "./persons/persons.service.js";
import { GraphService } from "./tree/graph.service.js";
import { TreeController } from "./tree/tree.controller.js";

/**
 * Modular monolith (ADR-001). Thứ tự guard: SessionGuard (đăng nhập, CSRF) → TenantGuard (thành viên, vai trò).
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, InstanceController, AuthController, MeController, ClansController, PersonsController, TreeController, MembersController, InvitationsController, MediaController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        Database,
        AuthService,
        ClansService,
        GraphService,
        PersonsService,
        MembersService,
        MediaStorage,
        MediaService,
        SiteService,
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }
}
