import * as React from "react";
import { addDays, format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerWithRangeProps {
  className?: string;
  date?: DateRange;
  onDateChange?: (date: DateRange | undefined) => void;
  placeholder?: string;
  numberOfMonths?: number;
}

export function DatePickerWithRange({
  className,
  date,
  onDateChange,
  placeholder = "Pick a date range",
  numberOfMonths = 2,
  ...props
}: DatePickerWithRangeProps & React.HTMLAttributes<HTMLDivElement>) {
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(date);

  React.useEffect(() => {
    setDateRange(date);
  }, [date]);

  const handleDateChange = (range: DateRange | undefined) => {
    setDateRange(range);
    onDateChange?.(range);
  };

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !dateRange && "text-muted-foreground"
            )}
            data-testid="date-range-trigger"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y")} -{" "}
                  {format(dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleDateChange}
            numberOfMonths={numberOfMonths}
            data-testid="date-range-calendar"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Also export individual date picker for single dates
interface DatePickerProps {
  className?: string;
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  placeholder?: string;
}

export function DatePicker({
  className,
  date,
  onDateChange,
  placeholder = "Pick a date",
  ...props
}: DatePickerProps & React.HTMLAttributes<HTMLDivElement>) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date);

  React.useEffect(() => {
    setSelectedDate(date);
  }, [date]);

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    onDateChange?.(date);
  };

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-[280px] justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground"
            )}
            data-testid="date-picker-trigger"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate, "PPP") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateChange}
            initialFocus
            data-testid="date-picker-calendar"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}