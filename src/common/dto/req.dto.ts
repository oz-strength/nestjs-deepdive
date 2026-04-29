import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt } from "class-validator";

export class PageReqDto {
  @ApiPropertyOptional({default: 1, description: '페이지 번호'})
  @Transform(param => Number(param.value))
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({default: 20, description: '페이지 당 아이템 수'})
  @Transform(param => Number(param.value))
  @IsInt()
  size?: number = 20;
}