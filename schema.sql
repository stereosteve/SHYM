-- yolo
drop table if exists tracks ;
drop table if exists artists;

create table if not exists artists (
  "id" text primary key,
  "name" text not null,
  "imageKey" text not null,
  "location" text,
  "bio" text,
  "website" text
);

create table if not exists tracks (
  "id" text primary key,
  "title" text not null,
  "imageKey" text not null,
  "audioKey" text not null,
  "artistId" text not null,
  "description" text,
  "createdAt" datetime default current_timestamp,
  "updatedAt" datetime default current_timestamp
);
