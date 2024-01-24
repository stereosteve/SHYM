-- yolo
drop table if exists tracks;

create table if not exists artists (
  id text primary key,
  name text not null,
  location text,
  bio text,
  website text
);

create table if not exists tracks (
  id text primary key,
  title text not null,
  artist_id text not null,
  description text,
  created_at datetime default current_timestamp
);
