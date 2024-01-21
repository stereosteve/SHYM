-- yolo
drop table if exists tracks;

create table if not exists tracks (
  id text primary key,
  title text not null,
  artist text not null,
  description text,
  created_at datetime default current_timestamp
);
