import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT à envoyer dans `Authorization: Bearer <jeton>`',
  })
  readonly accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  readonly tokenType: 'Bearer';

  @ApiProperty({
    description: 'Durée de validité du jeton, en secondes',
    example: 28800,
  })
  readonly expiresIn: number;

  @ApiProperty({ type: UserResponseDto })
  readonly user: UserResponseDto;
}
