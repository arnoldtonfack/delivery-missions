import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { IAuthenticatedUser } from '../../common/guards/authenticated-request';
import { ApiDataResponse } from '../../common/swagger/api-data-response.decorator';
import {
  badRequestResponse,
  unauthorizedResponse,
} from '../../common/swagger/api-error-responses';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiUnauthorizedResponse(unauthorizedResponse())
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Nombre de missions par statut pour la journée',
    description:
      'Missions PRÉVUES ce jour-là, par statut actuel ; sans `date` : aujourd’hui ' +
      '(fuseau Africa/Douala, horloge serveur). Dispatcher : toutes les missions. ' +
      'Chauffeur : uniquement les siennes. Les quatre statuts sont toujours ' +
      'présents (0 si aucune mission).',
  })
  @ApiDataResponse(DashboardResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse('Date invalide', ['date must be YYYY-MM-DD']),
  )
  missionsByStatus(
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.missionsByStatus(query, user);
  }
}
