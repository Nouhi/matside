import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as express from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post('competitions/:competitionId/categories/generate')
  generate(
    @Req() req: express.Request,
    @Param('competitionId') competitionId: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.categoriesService.generateCategories(competitionId, user.sub);
  }

  @Get('competitions/:competitionId/categories')
  findAll(@Param('competitionId') competitionId: string) {
    return this.categoriesService.findAll(competitionId);
  }

  @Get('categories/:id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post('competitors/:competitorId/assign-category')
  assignCompetitor(
    @Req() req: express.Request,
    @Param('competitorId') competitorId: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.categoriesService.assignCompetitor(competitorId, user.sub);
  }

  @Post('competitions/:competitionId/categories/assign-mats')
  assignCategoriesToMats(
    @Req() req: express.Request,
    @Param('competitionId') competitionId: string,
  ) {
    const user = req.user as { sub: string; email: string };
    return this.categoriesService.assignCategoriesToMats(competitionId, user.sub);
  }

  @Patch('categories/:id/mat')
  assignCategoryToMat(
    @Req() req: express.Request,
    @Param('id') categoryId: string,
    @Body() body: { matId: string | null },
  ) {
    const user = req.user as { sub: string; email: string };
    return this.categoriesService.assignCategoryToMat(categoryId, body.matId, user.sub);
  }
}
