import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('public/competitions')
export class PublicCompetitionsController {
  constructor(private prisma: PrismaService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      select: { id: true, name: true, date: true, location: true, status: true },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    return competition;
  }
}
