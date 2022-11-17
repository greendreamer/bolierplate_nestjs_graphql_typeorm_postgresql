import { BadRequestException, Module } from '@nestjs/common';
import { pick } from 'lodash';
import { IWhere, processWhere } from '../util/processWhere';
import {
  FindManyOptions,
  FindOneOptions,
  FindOptionsOrder,
  FindOptionsRelations,
} from 'typeorm';
import { Repository } from 'typeorm/repository/Repository';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsNotEmpty } from 'class-validator';
import { isObject } from 'src/util/isObject';

const valueObj = {
  ASC: 'ASC',
  DESC: 'DESC',
  asc: 'asc',
  desc: 'desc',
  1: 1,
  '-1': -1,
} as const;

const direction = ['ASC', 'DESC', 'asc', 'desc'] as const;
type DirectionUnion = typeof direction[number];

const nulls = ['first', 'last', 'FIRST', 'LAST'] as const;
type NullsUnion = typeof nulls[number];

const checkObject = {
  direction,
  nulls,
};

const directionObj = {
  direction: 'direction',
  nulls: 'nulls',
} as const;

type IDirectionWitnNulls = {
  [directionObj.direction]?: DirectionUnion;
  [directionObj.nulls]?: NullsUnion;
};

type IDriection = typeof valueObj[keyof typeof valueObj];
type ISort = IDriection | IDirectionWitnNulls;

export type IOrder<T> = {
  [key in keyof T]?: ISort;
};

export type IDataType = 'count' | 'data' | 'all';

export type IRelation<T> = (keyof T)[];
@InputType()
export class IPagination {
  @Field(() => Int, { description: 'Started from 0' })
  @IsNotEmpty()
  page: number;

  @Field(() => Int, { description: 'Size of page' })
  @IsNotEmpty()
  size: number;
}

export interface RepoQuery<T> {
  pagination?: IPagination;
  where?: IWhere<T>;
  order?: IOrder<T>;
  relations?: IRelation<T>;
  dataType?: IDataType;
}

export interface IGetData<T> {
  data?: T[];
  count?: number;
}

export type OneRepoQuery<T> = Pick<RepoQuery<T>, 'where' | 'relations'>;

declare module 'typeorm/repository/Repository' {
  interface Repository<Entity> {
    getMany(
      this: Repository<Entity>,
      qs: RepoQuery<Entity>,
    ): Promise<IGetData<Entity>>;
    getOne(this: Repository<Entity>, qs: OneRepoQuery<Entity>): Promise<Entity>;
  }
}

@Module({})
export class DeclareModule {
  constructor() {
    this.call();
  }
  call() {
    Repository.prototype.getMany = async function <T>(
      this: Repository<T>,
      { pagination, where, order, relations, dataType = 'all' }: RepoQuery<T>,
    ): Promise<IGetData<T>> {
      // You can remark this lines(between START and END) if you don't want to use strict order roles
      // START
      if (order) {
        Object.entries(order).forEach(([key, value]: [string, ISort]) => {
          if (!(key in this.metadata.propertiesMap)) {
            throw new BadRequestException(
              `Order key ${key} is not in ${this.metadata.name}`,
            );
          }

          if (!valueObj[value as IDriection] && !isObject(value)) {
            throw new BadRequestException(
              `Order must be ${Object.keys(valueObj).join(' or ')}`,
            );
          }

          Object.entries(value).forEach(([_key, _value]) => {
            if (!directionObj[_key]) {
              throw new BadRequestException(
                `Order must be ${Object.keys(directionObj).join(' or ')}`,
              );
            }
            if (!checkObject[_key].includes(_value as any)) {
              throw new BadRequestException(
                `Order ${_key} must be ${checkObject[_key].join(' or ')}`,
              );
            }
          });
        });
      }
      // END

      const condition: FindManyOptions<T> = {
        ...(relations && {
          relations: relations as unknown as FindOptionsRelations<T>,
        }),
        ...(where && { where: processWhere(where) }),
        ...(order && { order: order as FindOptionsOrder<T> }),
        ...(pagination && {
          skip: pagination.page * pagination.size,
          take: pagination.size,
        }),
      };

      const returns = {
        data: async () => ({ data: await this.find(condition) }),
        count: async () => ({ count: await this.count(condition) }),
        all: async () => {
          const res = await this.findAndCount(condition);
          return { data: res[0], count: res[1] };
        },
      };

      return returns[dataType]();
    };

    Repository.prototype.getOne = async function <T>(
      this: Repository<T>,
      { where, relations }: OneRepoQuery<T>,
    ): Promise<T> {
      const condition: FindOneOptions<T> = {
        ...(relations && {
          relations: relations as unknown as FindOptionsRelations<T>,
        }),
        ...(where && { where: processWhere(where) }),
      };

      return this.findOne(condition);
    };
  }
}
