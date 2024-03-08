import { Pagination } from "~/libs/components/components.js";
import { EMPTY_ARRAY_LENGTH } from "~/libs/constants/constants.js";
import { type usePagination } from "~/libs/hooks/hooks.js";
import { type UserAuthResponseDto } from "~/modules/users/users.js";

import { FriendList } from "../components.js";

type Properties = {
	items: UserAuthResponseDto[];
	pagination: ReturnType<typeof usePagination>;
};

const FriendsTab: React.FC<Properties> = ({
	items,
	pagination,
}: Properties) => {
	const { handlePageChange, page, pages, pagesCount } = pagination;
	const hasPages = items.length > EMPTY_ARRAY_LENGTH;

	return (
		<>
			<FriendList friends={items} />
			{hasPages && (
				<Pagination
					currentPage={page}
					onPageChange={handlePageChange}
					pages={pages}
					pagesCount={pagesCount}
				/>
			)}
		</>
	);
};

export { FriendsTab };