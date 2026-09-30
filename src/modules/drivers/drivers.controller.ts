import {
  Body,
  Controller,
  Get,
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
import { ApiDataResponse } from '../../common/swagger/api-data-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from '../../common/swagger/api-error-responses';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@ApiTags('drivers')
@ApiBearerAuth()
@Roles(Role.DISPATCHER)
@ApiUnauthorizedResponse(unauthorizedResponse())
@ApiForbiddenResponse(forbiddenResponse('Réservé au rôle DISPATCHER'))
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un compte chauffeur' })
  @ApiDataResponse(UserResponseDto, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse(
    badRequestResponse('Corps invalide', [
      'password must be longer than or equal to 8 characters',
    ]),
  )
  @ApiConflictResponse(
    conflictResponse('E-mail déjà utilisé', 'EMAIL_ALREADY_USED'),
  )
  create(@Body() dto: CreateDriverDto): Promise<UserResponseDto> {
    return this.driversService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les chauffeurs (filtre actif / inactif)' })
  @ApiDataResponse(UserResponseDto, { isArray: true })
  @ApiBadRequestResponse(
    badRequestResponse('Filtre invalide', ['isActive must be a boolean value']),
  )
  findAll(@Query() query: ListDriversQueryDto): Promise<UserResponseDto[]> {
    return this.driversService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un chauffeur' })
  @ApiDataResponse(UserResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse(
      'Identifiant invalide',
      'Validation failed (uuid is expected)',
    ),
  )
  @ApiNotFoundResponse(
    notFoundResponse('Chauffeur introuvable', 'DRIVER_NOT_FOUND'),
  )
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.driversService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier un chauffeur (nom, e-mail, mot de passe)',
  })
  @ApiDataResponse(UserResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse('Corps invalide', ['email must be an email']),
  )
  @ApiNotFoundResponse(
    notFoundResponse('Chauffeur introuvable', 'DRIVER_NOT_FOUND'),
  )
  @ApiConflictResponse(
    conflictResponse('E-mail déjà utilisé', 'EMAIL_ALREADY_USED'),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<UserResponseDto> {
    return this.driversService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activer / désactiver un chauffeur' })
  @ApiDataResponse(UserResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse('Corps invalide', ['isActive must be a boolean value']),
  )
  @ApiNotFoundResponse(
    notFoundResponse('Chauffeur introuvable', 'DRIVER_NOT_FOUND'),
  )
  @ApiConflictResponse(
    conflictResponse(
      'Le chauffeur a encore des missions PLANNED ou STARTED',
      'DRIVER_HAS_OPEN_MISSIONS',
    ),
  )
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverStatusDto,
  ): Promise<UserResponseDto> {
    return this.driversService.setActive(id, dto.isActive);
  }
}
