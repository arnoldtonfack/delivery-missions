import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
  notFoundResponse,
  unauthorizedResponse,
} from '../../common/swagger/api-error-responses';
import { CreateMissionDto } from './dto/create-mission.dto';
import { ListMissionsQueryDto } from './dto/list-missions-query.dto';
import { MissionDetailResponseDto } from './dto/mission-detail-response.dto';
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
  @ApiOperation({
    summary: 'Créer une mission et l’assigner à un chauffeur',
    description:
      'La mission naît PLANNED. Le chauffeur doit être un DRIVER actif ; la date ' +
      'prévue est aujourd’hui ou plus tard (fuseau Africa/Douala). La référence est ' +
      'normalisée (trim + majuscules) et unique. Une première entrée d’historique ' +
      '`null → PLANNED` est écrite avec le dispatcher pour auteur.',
  })
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

  @Get()
  @ApiOperation({
    summary: 'Lister les missions d’un jour (filtres date, chauffeur, statut)',
    description:
      'Sans `date` : missions prévues aujourd’hui (fuseau Africa/Douala, horloge ' +
      'serveur). Dispatcher : toutes, filtrables par `driverId` et `status`. ' +
      'Chauffeur : uniquement les siennes — tout `driverId` envoyé est ignoré et ' +
      'remplacé par le sien côté serveur. Sans historique (voir le détail).',
  })
  @ApiDataResponse(MissionResponseDto, { isArray: true })
  @ApiBadRequestResponse(
    badRequestResponse('Filtre invalide', [
      'status must be one of the following values: PLANNED, STARTED, DELIVERED, FAILED',
    ]),
  )
  findAll(
    @Query() query: ListMissionsQueryDto,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<MissionResponseDto[]> {
    return this.missionsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Détail d’une mission avec l’historique des statuts',
    description:
      'Dispatcher : toute mission. Chauffeur : uniquement une mission qui lui est ' +
      'assignée ; celle d’un autre chauffeur renvoie 404, comme une mission ' +
      'inexistante, pour ne pas révéler son existence. Historique du plus ancien au ' +
      'plus récent (de → vers, auteur, date).',
  })
  @ApiDataResponse(MissionDetailResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse(
      'Identifiant invalide',
      'Validation failed (uuid is expected)',
    ),
  )
  @ApiNotFoundResponse(
    notFoundResponse(
      'Mission introuvable ou assignée à un autre chauffeur',
      'MISSION_NOT_FOUND',
    ),
  )
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<MissionDetailResponseDto> {
    return this.missionsService.findOne(id, user);
  }
}
