'use client';

import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';

export type TypeFilter = 'all' | 'expense' | 'income';

interface SearchToolbarProps {
  query: string;
  onQuery: (q: string) => void;
  typeFilter: TypeFilter;
  onTypeFilter: (t: TypeFilter) => void;
  accountFilter: string;
  onAccountFilter: (id: string) => void;
  accountOptions: SelectFieldOption[];
}

/**
 * Search and filters for the month shown, at the top of the statement
 * column. From 640px it sticks under the glass header (CSS); on a phone it
 * scrolls away, to keep the screen for rows.
 *
 * #pb-txn-search keeps every attribute it had, AppShell's '/' still focuses
 * it, and the X still clears ONLY the text (Type and Account each have their
 * own All option). New: Escape inside the field clears the text too. That
 * cannot fight a dialog: ModalFrame only handles Escape while one is open,
 * and then this field is not focusable.
 *
 * The account lens used to add a "{account} statement" chip with an X beside
 * the Account select. Only one account (or all) can be chosen and the select
 * already names it, so the chip said it twice; the way back is the select's
 * own "All accounts" (or pressing the account again in the Today card), and
 * the statement card below keeps the account in its title.
 */
export const SearchToolbar = forwardRef<HTMLDivElement, SearchToolbarProps>(function SearchToolbar({
  query, onQuery, typeFilter, onTypeFilter, accountFilter, onAccountFilter, accountOptions,
}, ref) {
  const { d } = useTranslation();

  // The X clears the typed text only, and shows only when there is text to
  // clear. Type and Account each have their own All option. Focus returns
  // to the box because the X disappears with the text.
  const clearSearch = () => {
    onQuery('');
    document.getElementById('pb-txn-search')?.focus();
  };

  return (
    <div ref={ref} className="card pb-txn-bar">
      <div className="pb-txn-search">
        <Search size={16} aria-hidden="true" className="pb-txn-search-icon" />
        <input
          id="pb-txn-search"
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query !== '' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onQuery('');
            }
          }}
          placeholder={d.txnSearch.placeholder}
          aria-label={d.txnSearch.placeholder}
        />
        {query !== '' && (
          <button
            type="button" onClick={clearSearch} className="icon-btn pb-txn-search-clear" aria-label={d.txnSearch.clear} title={d.txnSearch.clear}
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="pb-txn-filters">
        {/* Kit segmented control: the same three options, now one radiogroup
            with a sliding thumb and arrow keys, instead of hand-styled pills.
            Expense and Income still exclude adjustments. */}
        <SegmentedControl<TypeFilter>
          options={[
            { value: 'all', label: d.txnSearch.typeAll },
            { value: 'expense', label: d.enums.kind.expense },
            { value: 'income', label: d.enums.kind.income },
          ]}
          value={typeFilter}
          onChange={onTypeFilter}
          ariaLabel={d.txnSearch.typeLabel}
          size="sm"
          className="pb-txn-type"
        />
        <div className="pb-txn-account-select">
          <SelectField
            value={accountFilter}
            onChange={onAccountFilter}
            options={accountOptions}
            placeholder={d.txnSearch.allAccounts}
            ariaLabel={d.txnSearch.accountLabel}
          />
        </div>
      </div>
    </div>
  );
});
