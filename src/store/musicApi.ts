import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  getMusic,
  getMyMusic,
  type MusicPage,
} from '@/api/music';

export type MusicPageQueryArgs = {
  view: 'home' | 'playlist' | 'favorites';
  page: number;
  pageSize: number;
  userId?: string;
};

export const musicApi = createApi({
  reducerPath: 'musicApi',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['MusicPage'],
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    getMusicPage: builder.query<MusicPage, MusicPageQueryArgs>({
      async queryFn({ view, page, pageSize, userId }) {
        try {
          const result = view === 'home'
            ? await getMusic({ page, pageSize })
            : await getMyMusic({
              page,
              pageSize,
              collection: view === 'favorites' ? 'favorites' : 'uploads',
              userId,
            });
          return { data: result };
        } catch (error) {
          return {
            error: error instanceof Error
              ? error
              : new Error('Failed to load music page'),
          };
        }
      },
      providesTags: (_result, _error, args) => [
        { type: 'MusicPage', id: `${args.view}:${args.userId || 'guest'}:${args.page}:${args.pageSize}` },
      ],
    }),
  }),
});
