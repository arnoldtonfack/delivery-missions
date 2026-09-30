import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { IAuthenticatedUser } from '../../common/guards/authenticated-request';
import { ApiDataResponse } from '../../common/swagger/api-data-response.decorator';
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from '../../common/swagger/api-error-responses';
import { CreateMissionDto } from './dto/create-mission.dto';
import { MissionResponseDto } from './dto/mission-response.dto';
import { MissionsService } from './missions.service';

@ApiTags('missions')
@ApiBearerAuth()
@ApiUnauthorizedResponse(unauthorizedResponse())
@Controller('missions')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post()
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Créer une mission et l’assigner à un chauffeur' })
  @ApiDataResponse(MissionResponseDto, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse(
    badRequestResponse(
      'Corps invalide, date passée (PLANNED_DATE_IN_PAST), chauffeur inconnu ' +
        '(DRIVER_NOT_FOUND) ou désactivé (DRIVER_INACTIVE)',
      'DRIVER_INACTIVE',
    ),
  )
  @ApiForbiddenResponse(forbiddenResponse('Réservé au rôle DISPATCHER'))
  @ApiConflictResponse(
    conflictResponse(
      'Référence déjà utilisée',
      'MISSION_REFERENCE_ALREADY_USED',
    ),
  )
  create(
    @Body() dto: CreateMissionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<MissionResponseDto> {
    return this.missionsService.create(dto, user.id);
  }
}
