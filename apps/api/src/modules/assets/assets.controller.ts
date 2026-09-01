import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../common/auth/auth.guard.js";
import { RequireRoles, RolesGuard } from "../../common/auth/roles.guard.js";
import { AssetsService } from "./assets.service.js";
@Controller("assets")
@UseGuards(AuthGuard, RolesGuard)
export class AssetsController {
 constructor(private readonly assets:AssetsService){}
 @Get("schools") listSchools(){return this.assets.listSchools();}
 @Post("schools") @RequireRoles("owner","admin") createSchool(@Body() body:{id:string;name:string}){return this.assets.createSchool(body);}
}