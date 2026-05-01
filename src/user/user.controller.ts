import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorator/public.decorator';
import { Roles } from 'src/common/decorator/role.decorator';
import { ApiGetItemsResponse, ApiGetResponse } from 'src/common/decorator/swagger.decorator';
import { PageReqDto } from 'src/common/dto/req.dto';
import { PageResDto } from 'src/common/dto/res.dto';
import { FindUserReqDto } from './dto/req.dto';
import { FindUserResDto } from './dto/res.dto';
import { Role } from './enum/user.enum';
import { UserService } from './user.service';

@ApiTags('User')
@ApiExtraModels(FindUserReqDto, FindUserResDto, PageResDto)
@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiBearerAuth()
  @ApiGetItemsResponse(FindUserResDto)
  @Roles(Role.Admin)
  @Get()
  async findAll(@Query() { page, size }: PageReqDto): Promise<FindUserResDto[]> {
    // throw new Error('Test Sentry');
    const users = await this.userService.findAll(page, size);
    return users.map(({ id, email, createdAt }) => {
      return {
        id,
        email,
        createdAt: createdAt.toISOString(),
      };
    });
  }

  @ApiBearerAuth()
  @ApiGetResponse(FindUserResDto)
  @Get(':id')
  findOne(@Param('id') { id }: FindUserReqDto) {
    return this.userService.findOne(id);
  }

  @Public()
  @Post('bulk')
  createBulk() {
    return this.userService.createBulk();
  }
}
