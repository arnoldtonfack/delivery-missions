import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { DeliverMissionDto } from './dto/deliver-mission.dto';
import { FailMissionDto } from './dto/fail-mission.dto';
import { ListMissionsQueryDto } from './dto/list-missions-query.dto';
import { MissionDetailResponseDto } from './dto/mission-detail-response.dto';
import { MissionResponseDto } from './dto/mission-response.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';
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
      'Chauffeur : uniquement les siennes — tout `driverId` envoyé est remplacé ' +
      'par le sien côté serveur. Sans historique (voir le détail).',
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

  @Patch(':id')
  @Roles(Role.DISPATCHER)
  @ApiOperation({
    summary: 'Modifier ou réassigner une mission (uniquement si PLANNED)',
    description:
      'Seuls les champs envoyés sont modifiés ; `driverId` réassigne la mission à un ' +
      'autre DRIVER actif. Refusé (409) dès que la mission est STARTED, DELIVERED ou ' +
      'FAILED : une mission en route ou terminée ne change plus. Mêmes règles qu’à la ' +
      'création pour la date (aujourd’hui ou plus tard) et la référence (unique).',
  })
  @ApiDataResponse(MissionResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse(
      'Corps invalide, date passée (PLANNED_DATE_IN_PAST), chauffeur inconnu ' +
        '(DRIVER_NOT_FOUND) ou désactivé (DRIVER_INACTIVE)',
      'PLANNED_DATE_IN_PAST',
    ),
  )
  @ApiForbiddenResponse(forbiddenResponse('Réservé au rôle DISPATCHER'))
  @ApiNotFoundResponse(
    notFoundResponse('Mission introuvable', 'MISSION_NOT_FOUND'),
  )
  @ApiConflictResponse(
    conflictResponse(
      'Mission plus PLANNED (MISSION_NOT_EDITABLE) ou référence déjà utilisée ' +
        '(MISSION_REFERENCE_ALREADY_USED)',
      'MISSION_NOT_EDITABLE',
    ),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMissionDto,
  ): Promise<MissionResponseDto> {
    return this.missionsService.update(id, dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DRIVER)
  @ApiOperation({
    summary: 'Démarrer une mission (PLANNED → STARTED)',
    description:
      'Réservé au chauffeur ASSIGNÉ : un dispatcher reçoit 403, un autre chauffeur ' +
      '404. Seule une mission PLANNED peut démarrer (sinon 409 ' +
      'INVALID_STATUS_TRANSITION). `startedAt` est l’horodatage serveur ; le ' +
      'changement est historisé (de → vers, qui, quand) dans la même transaction. ' +
      'Deux démarrages simultanés : un seul passe, l’autre reçoit 409.',
  })
  @ApiDataResponse(MissionResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse(
      'Identifiant invalide',
      'Validation failed (uuid is expected)',
    ),
  )
  @ApiForbiddenResponse(forbiddenResponse('Réservé au rôle DRIVER'))
  @ApiNotFoundResponse(
    notFoundResponse(
      'Mission introuvable ou assignée à un autre chauffeur',
      'MISSION_NOT_FOUND',
    ),
  )
  @ApiConflictResponse(
    conflictResponse(
      'Mission pas PLANNED (INVALID_STATUS_TRANSITION) ou modifiée en même temps ' +
        '(MISSION_CONFLICT)',
      'INVALID_STATUS_TRANSITION',
    ),
  )
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<MissionResponseDto> {
    return this.missionsService.start(id, user);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DRIVER)
  @ApiOperation({
    summary: 'Marquer une mission livrée (STARTED → DELIVERED)',
    description:
      'Réservé au chauffeur ASSIGNÉ : un dispatcher reçoit 403, un autre chauffeur ' +
      '404. Seule une mission STARTED peut être livrée (sinon 409 ' +
      'INVALID_STATUS_TRANSITION). Commentaire optionnel (vide après trim = aucun), ' +
      'repris dans l’historique. `completedAt` est l’horodatage serveur.',
  })
  @ApiDataResponse(MissionResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse('Identifiant ou corps invalide', [
      'comment must be shorter than or equal to 500 characters',
    ]),
  )
  @ApiForbiddenResponse(forbiddenResponse('Réservé au rôle DRIVER'))
  @ApiNotFoundResponse(
    notFoundResponse(
      'Mission introuvable ou assignée à un autre chauffeur',
      'MISSION_NOT_FOUND',
    ),
  )
  @ApiConflictResponse(
    conflictResponse(
      'Mission pas STARTED (INVALID_STATUS_TRANSITION) ou modifiée en même temps ' +
        '(MISSION_CONFLICT)',
      'INVALID_STATUS_TRANSITION',
    ),
  )
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliverMissionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<MissionResponseDto> {
    return this.missionsService.deliver(id, dto, user);
  }

  @Post(':id/fail')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DRIVER)
  @ApiOperation({
    summary: 'Marquer une mission en échec (STARTED → FAILED)',
    description:
      'Réservé au chauffeur ASSIGNÉ : un dispatcher reçoit 403, un autre chauffeur ' +
      '404. Seule une mission STARTED peut échouer (sinon 409 ' +
      'INVALID_STATUS_TRANSITION). Raison OBLIGATOIRE, non vide après trim (400), ' +
      'reprise dans l’historique. `completedAt` est l’horodatage serveur.',
  })
  @ApiDataResponse(MissionResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse('Identifiant invalide ou raison absente/vide', [
      'reason should not be empty',
    ]),
  )
  @ApiForbiddenResponse(forbiddenResponse('Réservé au rôle DRIVER'))
  @ApiNotFoundResponse(
    notFoundResponse(
      'Mission introuvable ou assignée à un autre chauffeur',
      'MISSION_NOT_FOUND',
    ),
  )
  @ApiConflictResponse(
    conflictResponse(
      'Mission pas STARTED (INVALID_STATUS_TRANSITION) ou modifiée en même temps ' +
        '(MISSION_CONFLICT)',
      'INVALID_STATUS_TRANSITION',
    ),
  )
  fail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailMissionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<MissionResponseDto> {
    return this.missionsService.fail(id, dto, user);
  }
}
