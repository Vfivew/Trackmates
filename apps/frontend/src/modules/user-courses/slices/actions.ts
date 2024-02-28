import { createAsyncThunk } from "@reduxjs/toolkit";

import { NotificationMessage } from "~/libs/modules/notification/notification.js";
import { type AsyncThunkConfig } from "~/libs/types/types.js";

import {
	type AddCourseRequestDto,
	type CourseDto,
	type CoursesResponseDto,
} from "../libs/types/types.js";
import { name as sliceName } from "./user-courses.slice.js";

const add = createAsyncThunk<CourseDto, AddCourseRequestDto, AsyncThunkConfig>(
	`${sliceName}/add`,
	async (requestPayload, { extra }) => {
		const { notification, userCourseApi } = extra;

		const newCourse = await userCourseApi.add(requestPayload);
		notification.success(NotificationMessage.COURSE_ADDED);

		return newCourse;
	},
);

const loadMyCourses = createAsyncThunk<
	CoursesResponseDto,
	{
		id: number;
		search: string;
	},
	AsyncThunkConfig
>(`${sliceName}/load-all`, (loadMyCoursesPayload, { extra }) => {
	const { userCourseApi } = extra;

	return userCourseApi.getAllByUserId(loadMyCoursesPayload);
});

export { add, loadMyCourses };