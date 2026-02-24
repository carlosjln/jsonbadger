export default function elem_match_operator(array_expression, predicate_expression) {
	return 'EXISTS (SELECT 1 FROM jsonb_array_elements(' + array_expression + ') AS elem WHERE ' + predicate_expression + ')';
}
